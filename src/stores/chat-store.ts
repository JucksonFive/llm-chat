import { create } from 'zustand'
import type { Conversation, Message, ToolCallInfo } from '@/types'
import { apiFetch } from '@/lib/api-fetch'

interface ChatState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  isStreaming: boolean
  loaded: boolean

  loadConversations: () => Promise<void>
  loadMessages: (conversationId: string) => Promise<void>
  createConversation: (agentId: string, projectId?: string | null) => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'createdAt'>) => string
  persistMessage: (conversationId: string, message: Message) => Promise<void>
  appendToLastMessage: (conversationId: string, token: string) => void
  appendReasoningToLastMessage: (conversationId: string, token: string) => void
  finalizeLastMessage: (conversationId: string) => void
  setMessageError: (conversationId: string, error: string) => void
  setStreaming: (streaming: boolean) => void
  addToolCallToLastMessage: (conversationId: string, toolCall: ToolCallInfo) => void
  updateToolCallInLastMessage: (conversationId: string, toolCallId: string, updates: Partial<ToolCallInfo>) => void
  getConversationsForAgent: (agentId: string) => Conversation[]
  updateConversationTitle: (id: string, title: string) => Promise<void>
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: {},
  activeConversationId: null,
  isStreaming: false,
  loaded: false,

  loadConversations: async () => {
    const res = await fetch('/api/db/conversations')
    const convs: Conversation[] = await res.json()
    const map: Record<string, Conversation> = {}
    for (const c of convs) {
      map[c.id] = { ...c, projectId: c.projectId || null, messages: [] }
    }
    set({ conversations: map, loaded: true })
  },

  loadMessages: async (conversationId) => {
    const res = await fetch(`/api/db/conversations/${conversationId}/messages`)
    const messages: Message[] = await res.json()
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv) return state
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages },
        },
      }
    })
  },

  createConversation: async (agentId, projectId) => {
    const res = await apiFetch('/api/db/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, projectId: projectId || null }),
    })
    const { id } = await res.json()
    const conversation: Conversation = {
      id,
      agentId,
      projectId: projectId || null,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({
      conversations: { ...state.conversations, [id]: conversation },
      activeConversationId: id,
    }))
    return id
  },

  deleteConversation: async (id) => {
    await apiFetch(`/api/db/conversations/${id}`, { method: 'DELETE' })
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _discarded, ...rest } = state.conversations
      return {
        conversations: rest,
        activeConversationId:
          state.activeConversationId === id ? null : state.activeConversationId,
      }
    })
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  // Local-only add (for streaming, saved to DB later)
  addMessage: (conversationId, message) => {
    const msgId = crypto.randomUUID()
    const fullMessage: Message = {
      ...message,
      id: msgId,
      createdAt: Date.now(),
      streamStartTime: message.isStreaming ? Date.now() : undefined,
    }
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv) return state
      const updatedConv = {
        ...conv,
        messages: [...conv.messages, fullMessage],
        updatedAt: Date.now(),
        title:
          conv.messages.length === 0 && message.role === 'user'
            ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
            : conv.title,
      }
      return {
        conversations: { ...state.conversations, [conversationId]: updatedConv },
      }
    })
    return msgId
  },

  // Persist a message to the database
  persistMessage: async (conversationId, message) => {
    await apiFetch(`/api/db/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        reasoning: message.reasoning,
        toolCalls: message.toolCalls,
        attachments: message.attachments,
      }),
    })
  },

  appendToLastMessage: (conversationId, token) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.content += token
      // Mark that content generation has started (for "Generating..." indicator)
      if (!last.isGeneratingContent && last.content.length > 0) {
        last.isGeneratingContent = true
      }
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages, updatedAt: Date.now() },
        },
      }
    })
  },

  appendReasoningToLastMessage: (conversationId, token) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.reasoning = (last.reasoning || '') + token
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages, updatedAt: Date.now() },
        },
      }
    })
  },

  finalizeLastMessage: (conversationId) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.isStreaming = false
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages },
        },
      }
    })
  },

  setMessageError: (conversationId, error) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.error = error
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages },
        },
      }
    })
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  addToolCallToLastMessage: (conversationId, toolCall) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.toolCalls = [...(last.toolCalls ?? []), toolCall]
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages },
        },
      }
    })
  },

  updateToolCallInLastMessage: (conversationId, toolCallId, updates) => {
    set((state) => {
      const conv = state.conversations[conversationId]
      if (!conv || conv.messages.length === 0) return state
      const messages = [...conv.messages]
      const last = { ...messages[messages.length - 1] }
      last.toolCalls = (last.toolCalls ?? []).map((tc) =>
        tc.id === toolCallId ? { ...tc, ...updates } : tc
      )
      messages[messages.length - 1] = last
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: { ...conv, messages },
        },
      }
    })
  },

  getConversationsForAgent: (agentId) => {
    return Object.values(get().conversations)
      .filter((c) => c.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  updateConversationTitle: async (id, title) => {
    await apiFetch(`/api/db/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    set((state) => {
      const conv = state.conversations[id]
      if (!conv) return state
      return {
        conversations: {
          ...state.conversations,
          [id]: { ...conv, title },
        },
      }
    })
  },
}))
