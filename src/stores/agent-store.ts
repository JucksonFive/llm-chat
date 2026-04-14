import { create } from 'zustand'
import type { Agent } from '@/types'
import { AVATAR_COLORS } from '@/lib/providers'

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null
  loaded: boolean
  loadAgents: () => Promise<void>
  addAgent: (agent: Omit<Agent, 'id' | 'createdAt' | 'avatarColor' | 'mcpServerIds' | 'builtInToolIds'> & { mcpServerIds?: string[]; builtInToolIds?: string[] }) => Promise<Agent>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setActiveAgent: (id: string | null) => void
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  agents: [],
  activeAgentId: null,
  loaded: false,

  loadAgents: async () => {
    const res = await fetch('/api/db/agents')
    const agents = await res.json()
    set({ agents, loaded: true })
  },

  addAgent: async (data) => {
    const avatarColor = AVATAR_COLORS[get().agents.length % AVATAR_COLORS.length]
    const res = await fetch('/api/db/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        avatarColor,
        mcpServerIds: data.mcpServerIds ?? [],
        builtInToolIds: data.builtInToolIds ?? [],
      }),
    })
    const { id } = await res.json()
    const agent: Agent = {
      ...data,
      id,
      createdAt: Date.now(),
      avatarColor,
      mcpServerIds: data.mcpServerIds ?? [],
      builtInToolIds: (data.builtInToolIds ?? []) as Agent['builtInToolIds'],
    }
    set((state) => ({
      agents: [...state.agents, agent],
      activeAgentId: agent.id,
    }))
    return agent
  },

  updateAgent: async (id, updates) => {
    const agent = get().agents.find((a) => a.id === id)
    if (!agent) return
    const merged = { ...agent, ...updates }
    await fetch(`/api/db/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    })
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }))
  },

  deleteAgent: async (id) => {
    await fetch(`/api/db/agents/${id}`, { method: 'DELETE' })
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
    }))
  },

  setActiveAgent: (id) => set({ activeAgentId: id }),
}))
