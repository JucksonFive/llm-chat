import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Agent } from '@/types'
import { AVATAR_COLORS } from '@/lib/providers'

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null
  addAgent: (agent: Omit<Agent, 'id' | 'createdAt' | 'avatarColor' | 'mcpServerIds' | 'builtInToolIds'> & { mcpServerIds?: string[]; builtInToolIds?: string[] }) => Agent
  updateAgent: (id: string, updates: Partial<Agent>) => void
  deleteAgent: (id: string) => void
  setActiveAgent: (id: string | null) => void
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      activeAgentId: null,

      addAgent: (data) => {
        const agent: Agent = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          avatarColor: AVATAR_COLORS[get().agents.length % AVATAR_COLORS.length],
          mcpServerIds: data.mcpServerIds ?? [],
          builtInToolIds: (data.builtInToolIds ?? []) as Agent['builtInToolIds'],
        }
        set((state) => ({
          agents: [...state.agents, agent],
          activeAgentId: agent.id,
        }))
        return agent
      },

      updateAgent: (id, updates) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        }))
      },

      deleteAgent: (id) => {
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
          activeAgentId:
            state.activeAgentId === id ? null : state.activeAgentId,
        }))
      },

      setActiveAgent: (id) => set({ activeAgentId: id }),
    }),
    { name: 'llm-chat-agents' }
  )
)
