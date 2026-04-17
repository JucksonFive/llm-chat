import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * API keys are stored ONLY in the browser (localStorage), never on the server.
 * This means keys never leave the client except as part of the outgoing
 * /api/chat request body. Fresh for each device/browser.
 *
 * Keys are indexed by agent id. If multiple agents share a provider, the UI
 * can look up an existing key for that provider (see agent-dialog).
 */
interface ApiKeyState {
  keys: Record<string, string> // agentId -> apiKey
  getKey: (agentId: string) => string
  setKey: (agentId: string, apiKey: string) => void
  removeKey: (agentId: string) => void
  /** Find an existing key for the given provider from any agent. */
  findKeyForProvider: (providerId: string, agents: Array<{ id: string; providerId: string }>) => string
}

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set, get) => ({
      keys: {},

      getKey: (agentId) => get().keys[agentId] ?? '',

      setKey: (agentId, apiKey) =>
        set((state) => ({
          keys: { ...state.keys, [agentId]: apiKey },
        })),

      removeKey: (agentId) =>
        set((state) => {
          const { [agentId]: _removed, ...rest } = state.keys
          return { keys: rest }
        }),

      findKeyForProvider: (providerId, agents) => {
        const keys = get().keys
        for (const agent of agents) {
          if (agent.providerId === providerId && keys[agent.id]) {
            return keys[agent.id]
          }
        }
        return ''
      },
    }),
    {
      name: 'llm-chat-api-keys',
      version: 1,
    },
  ),
)
