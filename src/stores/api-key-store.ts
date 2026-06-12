import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * API keys are stored ONLY in the browser (localStorage), never on the server.
 * This means keys never leave the client except as part of the outgoing
 * /api/chat request body. Fresh for each device/browser.
 *
 * Keys are indexed by agent id. If multiple agents share a provider, the UI
 * can look up an existing key for that provider (see agent-dialog).
 *
 * For AWS Bedrock, we store credentials as JSON: { accessKeyId, secretAccessKey, region }
 */
interface ApiKeyState {
  keys: Record<string, string> // agentId -> apiKey (or JSON for AWS credentials)
  getKey: (agentId: string) => string
  setKey: (agentId: string, apiKey: string) => void
  removeKey: (agentId: string) => void
  /** Merge a batch of keys (used by the legacy server-side migration). Existing keys are preserved. */
  mergeKeys: (incoming: Record<string, string>) => void
  /** Find an existing key for the given provider from any agent. */
  findKeyForProvider: (providerId: string, agents: Array<{ id: string; providerId: string }>) => string
  /** Get AWS credentials for Bedrock */
  getAwsCredentials: (agentId: string) => { accessKeyId: string; secretAccessKey: string; region: string } | null
  /** Set AWS credentials for Bedrock */
  setAwsCredentials: (agentId: string, credentials: { accessKeyId: string; secretAccessKey: string; region: string }) => void
  /** Find existing AWS credentials for Bedrock from any agent */
  findAwsCredentialsForBedrock: (agents: Array<{ id: string; providerId: string }>) => { accessKeyId: string; secretAccessKey: string; region: string } | null
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [agentId]: _, ...rest } = state.keys
          return { keys: rest }
        }),

      mergeKeys: (incoming) =>
        set((state) => {
          // Keep any key already present locally — the user may have updated
          // it via the agent dialog before the migration ran.
          const merged: Record<string, string> = { ...incoming, ...state.keys }
          return { keys: merged }
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

      getAwsCredentials: (agentId) => {
        const key = get().keys[agentId]
        if (!key) return null
        try {
          const parsed = JSON.parse(key)
          if (parsed.accessKeyId && parsed.secretAccessKey && parsed.region) {
            return parsed
          }
          return null
        } catch {
          return null
        }
      },

      setAwsCredentials: (agentId, credentials) => {
        set((state) => ({
          keys: { ...state.keys, [agentId]: JSON.stringify(credentials) },
        }))
      },

      findAwsCredentialsForBedrock: (agents) => {
        const keys = get().keys
        for (const agent of agents) {
          if (agent.providerId === 'bedrock' && keys[agent.id]) {
            try {
              const parsed = JSON.parse(keys[agent.id])
              if (parsed.accessKeyId && parsed.secretAccessKey && parsed.region) {
                return parsed
              }
            } catch {
              // ignore invalid JSON
            }
          }
        }
        return null
      },
    }),
    {
      name: 'llm-chat-api-keys',
      version: 1,
    },
  ),
)
