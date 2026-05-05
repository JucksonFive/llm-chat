import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SYSTEM_PROMPT, LEGACY_DEFAULT_SYSTEM_PROMPT } from '@/lib/default-system-prompt'
import { PROGRAMMER_AGENT_TEMPLATE } from '@/lib/agent-templates'
import type { Agent } from '@/types'
import { AVATAR_COLORS } from '@/lib/providers'
import { useApiKeyStore } from '@/stores/api-key-store'

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

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      activeAgentId: null,
      loaded: false,

      loadAgents: async () => {
        const res = await fetch('/api/db/agents')
        const agents: Agent[] = await res.json()

        // One-time migration: pull any API keys still stored in the (now
        // legacy) server-side encrypted column into the browser store, then
        // wipe the column. Safe to run on every load — the endpoint returns
        // an empty object once migration is complete.
        try {
          const migRes = await fetch('/api/db/agents/legacy-api-keys')
          if (migRes.ok) {
            const { keys } = (await migRes.json()) as { keys: Record<string, string> }
            const entries = Object.entries(keys ?? {})
            if (entries.length > 0) {
              useApiKeyStore.getState().mergeKeys(keys)
              await fetch('/api/db/agents/legacy-api-keys/clear', { method: 'POST' })
            }
          }
        } catch (err) {
          console.warn('[agent-store] legacy api-key migration failed:', err)
        }

        if (agents.length === 0) {
          await get().addAgent({
            name: PROGRAMMER_AGENT_TEMPLATE.name,
            providerId: PROGRAMMER_AGENT_TEMPLATE.providerId,
            model: PROGRAMMER_AGENT_TEMPLATE.model,
            systemPrompt: PROGRAMMER_AGENT_TEMPLATE.systemPrompt,
            mcpServerIds: [],
            builtInToolIds: PROGRAMMER_AGENT_TEMPLATE.builtInToolIds,
          })
          set({ loaded: true })
          return
        }

        const persistedActiveId = get().activeAgentId
        const activeAgentId = persistedActiveId && agents.some((agent) => agent.id === persistedActiveId)
          ? persistedActiveId
          : agents[0]?.id ?? null

        set({ agents, activeAgentId, loaded: true })
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
    }),
    {
      name: 'llm-chat-agents',
      version: 2,
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState as AgentState

        const state = persistedState as AgentState

        if (version < 2 && Array.isArray(state.agents)) {
          return {
            ...state,
            agents: state.agents.map((agent) => ({
              ...agent,
              systemPrompt:
                !agent.systemPrompt || agent.systemPrompt === LEGACY_DEFAULT_SYSTEM_PROMPT
                  ? DEFAULT_SYSTEM_PROMPT
                  : agent.systemPrompt,
            })),
          }
        }

        return state
      },
    }
  )
)
