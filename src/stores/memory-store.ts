import { create } from 'zustand'
import type { Memory } from '@/types'

interface MemoryState {
  memories: Memory[]
  loaded: boolean
  loadMemories: () => Promise<void>
  addMemory: (agentId: string, content: string) => Promise<void>
  updateMemory: (id: string, content: string) => Promise<void>
  deleteMemory: (id: string) => Promise<void>
  getMemoriesForAgent: (agentId: string) => Memory[]
  getMemoryPrompt: (agentId: string) => string
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  memories: [],
  loaded: false,

  loadMemories: async () => {
    const res = await fetch('/api/db/memories')
    const memories = await res.json()
    set({ memories, loaded: true })
  },

  addMemory: async (agentId, content) => {
    const res = await fetch('/api/db/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, content }),
    })
    const { id } = await res.json()
    const memory: Memory = { id, agentId, content, createdAt: Date.now() }
    set((state) => ({ memories: [...state.memories, memory] }))
  },

  updateMemory: async (id, content) => {
    await fetch(`/api/db/memories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    set((state) => ({
      memories: state.memories.map((m) => (m.id === id ? { ...m, content } : m)),
    }))
  },

  deleteMemory: async (id) => {
    await fetch(`/api/db/memories/${id}`, { method: 'DELETE' })
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
}))
