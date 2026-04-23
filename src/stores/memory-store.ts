import { create } from 'zustand'
import type { Memory } from '@/types'

interface MemoryState {
  memories: Memory[]
  loaded: boolean
  loadMemories: () => Promise<void>
  addMemory: (agentId: string, content: string, type?: 'short' | 'long') => Promise<void>
  updateMemory: (id: string, content: string) => Promise<void>
  deleteMemory: (id: string) => Promise<void>
  getMemoriesForAgent: (agentId: string) => Memory[]
  getShortTermMemories: (agentId: string) => Memory[]
  getLongTermMemories: (agentId: string) => Memory[]
  getMemoryPrompt: (agentId: string) => string
  getRelevantMemoryPrompt: (agentId: string, query: string, apiKey: string, k?: number) => Promise<string>
  clearShortTermMemories: (agentId: string) => Promise<void>
}

const MAX_SHORT_TERM = 10

async function fetchRelevantLongTerm(
  agentId: string,
  query: string,
  apiKey: string,
  k: number,
  longTermCount: number,
): Promise<Memory[] | null> {
  if (!apiKey || longTermCount <= k || !query.trim()) return null
  try {
    const res = await fetch('/api/rag/memories/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, query, apiKey, k }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { memories?: Memory[]; fallback?: boolean }
    if (data.fallback || !Array.isArray(data.memories)) return null
    return data.memories
  } catch (err) {
    console.warn('[memory] semantic search failed, using all memories:', err)
    return null
  }
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  memories: [],
  loaded: false,

  loadMemories: async () => {
    const res = await fetch('/api/db/memories')
    const memories = await res.json()
    set({ memories, loaded: true })
  },

  addMemory: async (agentId, content, type = 'long') => {
    if (type === 'short') {
      const existing = get().getShortTermMemories(agentId)
      if (existing.length >= MAX_SHORT_TERM) {
        const oldest = existing[0]
        await fetch(`/api/db/memories/${oldest.id}`, { method: 'DELETE' })
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== oldest.id),
        }))
      }
    }

    const res = await fetch('/api/db/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, content, type }),
    })
    const { id } = await res.json()
    const memory: Memory = { id, agentId, content, type, createdAt: Date.now() }
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

  getShortTermMemories: (agentId) => {
    return get().memories
      .filter((m) => m.agentId === agentId && m.type === 'short')
      .sort((a, b) => a.createdAt - b.createdAt)
  },

  getLongTermMemories: (agentId) => {
    return get().memories
      .filter((m) => m.agentId === agentId && (m.type === 'long' || !m.type))
      .sort((a, b) => a.createdAt - b.createdAt)
  },

  getMemoryPrompt: (agentId) => {
    const shortTerm = get().getShortTermMemories(agentId)
    const longTerm = get().getLongTermMemories(agentId)

    if (shortTerm.length === 0 && longTerm.length === 0) return ''

    let prompt = ''

    if (longTerm.length > 0) {
      const items = longTerm.map((m) => `- ${m.content}`).join('\n')
      prompt += `\n\nLong-term memories (persistent facts about the user, preferences, and key information):\n${items}`
    }

    if (shortTerm.length > 0) {
      const items = shortTerm.map((m) => `- ${m.content}`).join('\n')
      prompt += `\n\nShort-term memories (recent context and conversation summaries):\n${items}`
    }

    return prompt
  },

  /**
   * Build a memory prompt using semantic search for long-term memories.
   * Short-term memories are always included (rolling window). If the semantic
   * search fails for any reason (no OpenAI key, network error, etc.), falls
   * back to the full-memory prompt so the feature degrades gracefully.
   */
  getRelevantMemoryPrompt: async (agentId, query, apiKey, k = 5) => {
    const shortTerm = get().getShortTermMemories(agentId)
    const longTerm = get().getLongTermMemories(agentId)
    if (shortTerm.length === 0 && longTerm.length === 0) return ''

    const relevantLong = await fetchRelevantLongTerm(agentId, query, apiKey, k, longTerm.length)
    const longToInclude = relevantLong ?? longTerm
    let prompt = ''

    if (longToInclude.length > 0) {
      const items = longToInclude.map((m) => `- ${m.content}`).join('\n')
      const label = relevantLong
        ? 'Long-term memories (most relevant to the current question):'
        : 'Long-term memories (persistent facts about the user, preferences, and key information):'
      prompt += `\n\n${label}\n${items}`
    }

    if (shortTerm.length > 0) {
      const items = shortTerm.map((m) => `- ${m.content}`).join('\n')
      prompt += `\n\nShort-term memories (recent context and conversation summaries):\n${items}`
    }

    return prompt
  },

  clearShortTermMemories: async (agentId) => {
    const shortTerm = get().getShortTermMemories(agentId)
    for (const m of shortTerm) {
      await fetch(`/api/db/memories/${m.id}`, { method: 'DELETE' })
    }
    set((state) => ({
      memories: state.memories.filter(
        (m) => !(m.agentId === agentId && m.type === 'short')
      ),
    }))
  },
}))
