import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Conversation, Message, ToolCallInfo } from '@/types'

interface ChatState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  isStreaming: boolean

  createConversation: (agentId: string) => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string | null) => void
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'createdAt'>) => string
  appendToLastMessage: (conversationId: string, token: string) => void
  finalizeLastMessage: (conversationId: string) => void
  setStreaming: (streaming: boolean) => void
  addToolCallToLastMessage: (conversationId: string, toolCall: ToolCallInfo) => void
  updateToolCallInLastMessage: (conversationId: string, toolCallId: string, updates: Partial<ToolCallInfo>) => void
  getConversationsForAgent: (agentId: string) => Conversation[]
  updateConversationTitle: (id: string, title: string) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeConversationId: null,
      isStreaming: false,

      createConversation: (agentId) => {
        const id = crypto.randomUUID()
        const conversation: Conversation = {
          id,
          agentId,
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

      deleteConversation: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.conversations
          return {
            conversations: rest,
            activeConversationId:
              state.activeConversationId === id ? null : state.activeConversationId,
          }
        })
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      addMessage: (conversationId, message) => {
        const msgId = crypto.randomUUID()
        const fullMessage: Message = {
          ...message,
          id: msgId,
          createdAt: Date.now(),
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

      appendToLastMessage: (conversationId, token) => {
        set((state) => {
          const conv = state.conversations[conversationId]
          if (!conv || conv.messages.length === 0) return state
          const messages = [...conv.messages]
          const last = { ...messages[messages.length - 1] }
          last.content += token
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

      updateConversationTitle: (id, title) => {
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
    }),
    {
      name: 'llm-chat-conversations',
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    }
  )
)
