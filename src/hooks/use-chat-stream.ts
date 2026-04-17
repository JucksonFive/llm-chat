import { useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useMcpStore } from '@/stores/mcp-store'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore } from '@/stores/ui-store'
import { speakText } from '@/stores/ui-store'
import { streamChat } from '@/lib/llm-client'
import type { McpServerConfig, Attachment } from '@/types'

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string, attachments?: Attachment[]) => {
    const { activeAgentId, agents } = useAgentStore.getState()
    const agent = agents.find((a) => a.id === activeAgentId)
    if (!agent) return

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

    // Add empty assistant message placeholder
    store.addMessage(conversationId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    store.setStreaming(true)

    // Build memory-augmented system prompt
    const memoryPrompt = useMemoryStore.getState().getMemoryPrompt(agent.id)
    const systemPrompt = agent.systemPrompt + memoryPrompt

    // Resolve MCP servers for this agent
    const mcpStore = useMcpStore.getState()
    const mcpServers = (agent.mcpServerIds ?? [])
      .map((id) => mcpStore.getServer(id))
      .filter((s): s is McpServerConfig => s !== undefined)

    const builtInToolIds = agent.builtInToolIds ?? []

    // Build message history (exclude the streaming placeholder)
    // Include tool results as text context in assistant messages
    const conv = useChatStore.getState().conversations[conversationId]
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
            parts.push({ type: 'image', image: att.dataUrl })
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
      apiKey: agent.apiKey,
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
        })
      },
      onToolResult: ({ toolCallId, result }) => {
        useChatStore.getState().updateToolCallInLastMessage(conversationId!, toolCallId, {
          result,
          status: 'complete',
        })
      },
      onToolError: ({ toolCallId, error }) => {
        useChatStore.getState().updateToolCallInLastMessage(conversationId!, toolCallId, {
          error,
          status: 'error',
        })
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
      },
      onError: (error) => {
        const store = useChatStore.getState()
        // Show error inline in the message bubble
        store.appendToLastMessage(conversationId!, `\n\n**Error:** ${error.message}`)
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
