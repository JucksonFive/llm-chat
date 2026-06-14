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
        const apiKeyStore = useApiKeyStore.getState()
        apiKeyStore.hydrateStatus(agents)

        // One-time migration from the previous browser-only storage model.
        // Values are copied into the server-side encrypted SQLite column and
        // then removed from localStorage.
        try {
          await apiKeyStore.migrateLegacyLocalStorageKeys(agents)
        } catch (err) {
          console.warn('[agent-store] local api-key migration failed:', err)
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

        const agentsWithKeyStatus = agents.map((agent) => ({
          ...agent,
          hasApiKey: apiKeyStore.hasKey(agent.id),
        }))

        const persistedActiveId = get().activeAgentId
        const activeAgentId = persistedActiveId && agentsWithKeyStatus.some((agent) => agent.id === persistedActiveId)
          ? persistedActiveId
          : agentsWithKeyStatus[0]?.id ?? null

        set({ agents: agentsWithKeyStatus, activeAgentId, loaded: true })
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
          hasApiKey: false,
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
