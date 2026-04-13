import { useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useMcpStore } from '@/stores/mcp-store'
import { streamChat } from '@/lib/llm-client'
import type { McpServerConfig } from '@/types'

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback((text: string) => {
    const { activeAgentId, agents } = useAgentStore.getState()
    const agent = agents.find((a) => a.id === activeAgentId)
    if (!agent) return

    const store = useChatStore.getState()
    let conversationId = store.activeConversationId

    if (!conversationId) {
      conversationId = store.createConversation(agent.id)
    }

    // Add user message
    store.addMessage(conversationId, { role: 'user', content: text })

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

    // Build message history (exclude the streaming placeholder)
    const conv = useChatStore.getState().conversations[conversationId]
    const historyMessages = conv.messages
      .filter((m) => m.role !== 'system' && !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    streamChat({
      providerId: agent.providerId,
      model: agent.model,
      apiKey: agent.apiKey,
      systemPrompt,
      messages: historyMessages,
      mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
      signal: controller.signal,
      onToken: (token) => {
        useChatStore.getState().appendToLastMessage(conversationId!, token)
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
        useChatStore.getState().finalizeLastMessage(conversationId!)
        useChatStore.getState().setStreaming(false)
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
