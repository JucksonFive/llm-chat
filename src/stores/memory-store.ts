import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Memory } from '@/types'

interface MemoryState {
  memories: Memory[]
  addMemory: (agentId: string, content: string) => void
  updateMemory: (id: string, content: string) => void
  deleteMemory: (id: string) => void
  getMemoriesForAgent: (agentId: string) => Memory[]
  getMemoryPrompt: (agentId: string) => string
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],

      addMemory: (agentId, content) => {
        const memory: Memory = {
          id: crypto.randomUUID(),
          agentId,
          content,
          createdAt: Date.now(),
        }
        set((state) => ({ memories: [...state.memories, memory] }))
      },

      updateMemory: (id, content) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, content } : m
          ),
        }))
      },

      deleteMemory: (id) => {
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== id),
        }))
      },

      getMemoriesForAgent: (agentId) => {
        return get().memories.filter((m) => m.agentId === agentId)
      },

      getMemoryPrompt: (agentId) => {
        const memories = get().getMemoriesForAgent(agentId)
        if (memories.length === 0) return ''
        const items = memories.map((m) => `- ${m.content}`).join('\n')
        return `\n\nUser memories (use these to personalize responses):\n${items}`
      },
    }),
    { name: 'llm-chat-memories' }
  )
)
