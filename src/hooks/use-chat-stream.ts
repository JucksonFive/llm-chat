import { useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useApiKeyStore } from '@/stores/api-key-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useMcpStore } from '@/stores/mcp-store'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore } from '@/stores/ui-store'
import { useResearchStore } from '@/stores/research-store'
import { speakText } from '@/stores/ui-store'
import { streamChat } from '@/lib/llm-client'
import { PROVIDERS } from '@/lib/providers'
import { computeToolContext, resolveAvailableTools } from '@/lib/tool-resolver'
import type { McpServerConfig, Attachment } from '@/types'

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null)
  const activeResearchRef = useRef<string | null>(null)

  const sendMessage = useCallback(async (text: string, attachments?: Attachment[]) => {
    const { activeAgentId, agents } = useAgentStore.getState()
    const agent = agents.find((a) => a.id === activeAgentId)
    if (!agent) return

    const provider = PROVIDERS[agent.providerId]
    const apiKey =
      useApiKeyStore.getState().getKey(agent.id) ||
      useApiKeyStore.getState().findKeyForProvider(agent.providerId, agents)

    // Only check for API key if provider requires it
    if (provider.requiresApiKey && !apiKey) {
      toast.error(
        `No API key set for ${agent.name}. Open the agent settings and add a ${agent.providerId} key.`,
      )
      return
    }

    const store = useChatStore.getState()
    let conversationId = store.activeConversationId

    if (!conversationId) {
      const projectId = useProjectStore.getState().activeProjectId
      conversationId = await store.createConversation(agent.id, projectId)
    }

    // Add user message (local) and persist to DB
    store.addMessage(conversationId, { role: 'user', content: text, attachments })
    const userMsg = useChatStore.getState().conversations[conversationId]?.messages.slice(-1)[0]
    if (userMsg) store.persistMessage(conversationId, userMsg)

    store.setStreaming(true)

    // Build memory-augmented system prompt. When an OpenAI key is available
    // we pick the most relevant long-term memories for this specific user
    // message via the semantic search endpoint; otherwise we fall back to
    // including all memories (legacy behavior).
    const openAiKey = useApiKeyStore.getState().findKeyForProvider('openai', agents)
    const { prompt: memoryPrompt, usedMemoryIds } = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(agent.id, text, openAiKey, 5)
    const systemPrompt = agent.systemPrompt + memoryPrompt

    // Mark memories as used and track count for the assistant message
    if (usedMemoryIds.length > 0) {
      useMemoryStore.getState().markMemoriesAsUsed(usedMemoryIds)
    }

    // Add empty assistant message placeholder with memory count
    store.addMessage(conversationId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
      memoriesUsedCount: usedMemoryIds.length > 0 ? usedMemoryIds.length : undefined,
    })

    // Resolve MCP servers for this agent
    const mcpStore = useMcpStore.getState()
    const mcpServers = (agent.mcpServerIds ?? [])
      .map((id) => mcpStore.getServer(id))
      .filter((s): s is McpServerConfig => s !== undefined)

    // Build message history (exclude the streaming placeholder)
    // Include tool results as text context in assistant messages
    const conv = useChatStore.getState().conversations[conversationId]

    // Resolve available built-in tools based on agent settings and context
    const toolContext = computeToolContext(conv.messages)
    const builtInToolIds = resolveAvailableTools(agent.builtInToolIds ?? [], toolContext)

    type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>
    const historyMessages: { role: string; content: MessageContent }[] = []
    for (const m of conv.messages) {
      if (m.role === 'system' || m.isStreaming) continue

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Build assistant content that includes tool call context
        let content = m.content || ''
        const toolContext = m.toolCalls
          .filter((tc) => tc.status === 'complete' && tc.result !== undefined)
          .map((tc) => {
            const resultStr = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)
            // Truncate very large results to avoid token overflow
            const truncated = resultStr.length > 5000 ? resultStr.slice(0, 5000) + '... [truncated]' : resultStr
            return `[Tool: ${tc.toolName}] ${truncated}`
          })
          .join('\n')
        if (toolContext) {
          content = content ? `${content}\n\n${toolContext}` : toolContext
        }
        if (content) {
          historyMessages.push({ role: 'assistant', content })
        }
      } else if (m.role === 'user' && m.attachments?.length) {
        // Build multimodal content for messages with attachments
        const parts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = []
        for (const att of m.attachments) {
          if (att.type === 'image') {
            // dataUrl may be missing for attachments loaded from DB — fetch the file as data URL.
            let dataUrl = att.dataUrl
            if (!dataUrl) {
              try {
                const resp = await fetch(`/api/db/attachments/${att.id}/file`)
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                const blob = await resp.blob()
                dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(reader.result as string)
                  reader.onerror = () => reject(reader.error)
                  reader.readAsDataURL(blob)
                })
              } catch (err) {
                console.warn(`[chat] Failed to load attachment ${att.id}:`, err)
                continue
              }
            }
            parts.push({ type: 'image', image: dataUrl })
          } else if (att.type === 'pdf' && att.textContent) {
            parts.push({ type: 'text', text: `[PDF: ${att.name}]\n${att.textContent}` })
          }
        }
        if (m.content) {
          parts.push({ type: 'text', text: m.content })
        }
        historyMessages.push({ role: 'user', content: parts })
      } else {
        historyMessages.push({ role: m.role, content: m.content })
      }
    }

    const controller = new AbortController()
    abortRef.current = controller

    // Track <think> block state for non-reasoning models
    let insideThink = false
    let tagBuffer = ''

    streamChat({
      providerId: agent.providerId,
      model: agent.model,
      apiKey,
      systemPrompt,
      messages: historyMessages,
      mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
      builtInToolIds: builtInToolIds.length > 0 ? builtInToolIds : undefined,
      signal: controller.signal,
      onToken: (token) => {
        const store = useChatStore.getState()
        // Parse <think>...</think> blocks into reasoning
        tagBuffer += token
        while (tagBuffer.length > 0) {
          if (insideThink) {
            const closeIdx = tagBuffer.indexOf('</think>')
            if (closeIdx !== -1) {
              // Emit reasoning up to close tag, then switch back to content
              const reasoningChunk = tagBuffer.slice(0, closeIdx)
              if (reasoningChunk) store.appendReasoningToLastMessage(conversationId!, reasoningChunk)
              tagBuffer = tagBuffer.slice(closeIdx + '</think>'.length)
              insideThink = false
            } else {
              // Might be a partial </think> tag at the end
              const partialMatch = tagBuffer.match(/<\/?t?h?i?n?k?>?$/)
              if (partialMatch && tagBuffer.endsWith(partialMatch[0])) {
                const safe = tagBuffer.slice(0, tagBuffer.length - partialMatch[0].length)
                if (safe) store.appendReasoningToLastMessage(conversationId!, safe)
                tagBuffer = partialMatch[0]
              } else {
                store.appendReasoningToLastMessage(conversationId!, tagBuffer)
                tagBuffer = ''
              }
              break
            }
          } else {
            const openIdx = tagBuffer.indexOf('<think>')
            if (openIdx !== -1) {
              // Emit content up to open tag, then switch to reasoning
              const contentChunk = tagBuffer.slice(0, openIdx)
              if (contentChunk) store.appendToLastMessage(conversationId!, contentChunk)
              tagBuffer = tagBuffer.slice(openIdx + '<think>'.length)
              insideThink = true
            } else {
              // Might be a partial <think> tag at the end
              const partialMatch = tagBuffer.match(/<t?h?i?n?k?>?$/)
              if (partialMatch && tagBuffer.endsWith(partialMatch[0])) {
                const safe = tagBuffer.slice(0, tagBuffer.length - partialMatch[0].length)
                if (safe) store.appendToLastMessage(conversationId!, safe)
                tagBuffer = partialMatch[0]
              } else {
                store.appendToLastMessage(conversationId!, tagBuffer)
                tagBuffer = ''
              }
              break
            }
          }
        }
      },
      onReasoning: (token) => {
        useChatStore.getState().appendReasoningToLastMessage(conversationId!, token)
      },
      onToolCall: ({ toolCallId, toolName, args }) => {
        useChatStore.getState().addToolCallToLastMessage(conversationId!, {
          id: toolCallId,
          toolName,
          args,
          status: 'calling',
          startTime: Date.now(),
        })

        // Start research tracking for deep-research tool (matches both naming conventions)
        if ((toolName === 'deep-research' || toolName === 'deep_research') && conversationId) {
          const researchStore = useResearchStore.getState()
          const researchId = researchStore.startResearch(conversationId)
          activeResearchRef.current = researchId

          // Simulate stage progression and source discovery
          // In production, this would parse streaming data from the tool
          const stages = ['planning', 'searching', 'fetching', 'analyzing', 'synthesizing'] as const
          let currentStageIndex = 0

          const stageInterval = setInterval(() => {
            const research = useResearchStore.getState().researches[researchId]
            if (!research) {
              clearInterval(stageInterval)
              return
            }

            currentStageIndex++
            if (currentStageIndex >= stages.length) {
              clearInterval(stageInterval)
              return
            }

            const nextStage = stages[currentStageIndex]
            researchStore.updateStage(researchId, nextStage)

            // Add demo sources when in searching/fetching stage
            if (nextStage === 'searching' || nextStage === 'fetching') {
              const demoSources = [
                { url: 'https://example.com/article1', title: 'Relevant Research Article' },
                { url: 'https://wikipedia.org/wiki/Topic', title: 'Wikipedia - Topic Overview' },
                { url: 'https://arxiv.org/abs/12345', title: 'Academic Paper on Topic' },
              ]

              demoSources.forEach((source, idx) => {
                setTimeout(() => {
                  researchStore.addSource(researchId, source)
                  setTimeout(() => {
                    researchStore.updateSource(researchId, source.url, 'complete')
                  }, 1000)
                }, idx * 800)
              })
            }

            // Update progress based on stage
            const progress = ((currentStageIndex + 1) / stages.length) * 90
            researchStore.updateProgress(researchId, progress)
          }, 3000)
        }
      },
      onToolResult: ({ toolCallId, result }) => {
        useChatStore.getState().updateToolCallInLastMessage(conversationId!, toolCallId, {
          result,
          status: 'complete',
        })

        // Complete research tracking
        if (activeResearchRef.current) {
          const researchStore = useResearchStore.getState()
          const research = researchStore.researches[activeResearchRef.current]

          if (research) {
            // Parse result to extract sources and stages
            // For now, simulate with demo data
            if (typeof result === 'object' && result !== null) {
              const resultObj = result as Record<string, unknown>

              // Extract sources if available
              if (Array.isArray(resultObj.sources)) {
                resultObj.sources.forEach((source: unknown) => {
                  if (typeof source === 'object' && source !== null) {
                    const sourceObj = source as Record<string, unknown>
                    if (typeof sourceObj.url === 'string') {
                      researchStore.addSource(activeResearchRef.current!, {
                        url: sourceObj.url,
                        title: typeof sourceObj.title === 'string' ? sourceObj.title : sourceObj.url,
                      })
                      // Mark as complete after a short delay
                      setTimeout(() => {
                        researchStore.updateSource(
                          activeResearchRef.current!,
                          sourceObj.url as string,
                          'complete'
                        )
                      }, 500)
                    }
                  }
                })
              }

              // Update stages based on result
              if (typeof resultObj.stage === 'string') {
                const stage = resultObj.stage as string
                const validStages = ['planning', 'searching', 'fetching', 'analyzing', 'synthesizing', 'reporting'] as const
                if (validStages.includes(stage as typeof validStages[number])) {
                  researchStore.updateStage(activeResearchRef.current, stage as typeof validStages[number])
                }
              }
            }

            // Complete the research
            researchStore.completeResearch(activeResearchRef.current)
            activeResearchRef.current = null
          }
        }
      },
      onToolError: ({ toolCallId, error }) => {
        useChatStore.getState().updateToolCallInLastMessage(conversationId!, toolCallId, {
          error,
          status: 'error',
        })

        // Clear research on error
        if (activeResearchRef.current) {
          useResearchStore.getState().clearResearch(activeResearchRef.current)
          activeResearchRef.current = null
        }
      },
      onDone: () => {
        // Flush any remaining tag buffer
        if (tagBuffer) {
          const store = useChatStore.getState()
          if (insideThink) {
            store.appendReasoningToLastMessage(conversationId!, tagBuffer)
          } else {
            store.appendToLastMessage(conversationId!, tagBuffer)
          }
          tagBuffer = ''
        }
        const s = useChatStore.getState()
        s.finalizeLastMessage(conversationId!)
        // Persist the completed assistant message to DB
        const lastMsg = s.conversations[conversationId!]?.messages.slice(-1)[0]
        if (lastMsg && lastMsg.role === 'assistant') {
          s.persistMessage(conversationId!, lastMsg)
          // Auto-speak the response if enabled
          if (useUIStore.getState().autoSpeak && lastMsg.content) {
            speakText(lastMsg.content)
          }
        }
        s.setStreaming(false)
        abortRef.current = null

        // Auto-extract memories in background
        const conv = s.conversations[conversationId!]
        if (conv && conv.messages.length >= 2) {
          const recentMsgs = conv.messages
            .filter((m) => !m.isStreaming && (m.role === 'user' || m.role === 'assistant'))
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content }))

          fetch('/api/extract-memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId: agent.providerId,
              model: agent.model,
              apiKey,
              messages: recentMsgs,
            }),
          })
            .then((r) => r.json())
            .then(({ memories }) => {
              const memStore = useMemoryStore.getState()
              const existingShort = memStore.getShortTermMemories(agent.id)
              const existingLong = memStore.getLongTermMemories(agent.id)
              const existingTexts = new Set([
                ...existingShort.map((m) => m.content),
                ...existingLong.map((m) => m.content),
              ])

              for (const item of memories.short || []) {
                if (item && !existingTexts.has(item)) {
                  memStore.addMemory(agent.id, item, 'short')
                  existingTexts.add(item)
                }
              }
              for (const item of memories.long || []) {
                if (item && !existingTexts.has(item)) {
                  memStore.addMemory(agent.id, item, 'long')
                  existingTexts.add(item)
                }
              }
            })
            .catch(() => {})
        }
      },
      onError: (error) => {
        const store = useChatStore.getState()
        // Mark message with error metadata for retry button
        store.setMessageError(conversationId!, error.message)
        store.finalizeLastMessage(conversationId!)
        store.setStreaming(false)
        toast.error(error.message)
        abortRef.current = null
      },
    })
  }, [])

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  return { sendMessage, abort }
}
