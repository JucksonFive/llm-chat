import { create } from 'zustand'
import type { Agent, ProviderId } from '@/types'
import { apiFetch } from '@/lib/api-fetch'

const LEGACY_STORAGE_NAME = 'llm-chat-api-keys'

/**
 * API key values are stored encrypted in SQLite via the server. The browser
 * keeps only per-agent presence flags so UI validation can stay responsive
 * without retaining secrets in localStorage.
 */
interface ApiKeyState {
  keyStatus: Record<string, boolean>
  hydrateStatus: (agents: Agent[]) => void
  hasKey: (agentId: string) => boolean
  setKey: (agentId: string, apiKey: string) => Promise<void>
  removeKey: (agentId: string) => Promise<void>
  migrateLegacyLocalStorageKeys: (agents: Agent[]) => Promise<number>
  hasKeyForProvider: (providerId: ProviderId, agents: Array<{ id: string; providerId: ProviderId }>) => boolean
  setAwsCredentials: (agentId: string, credentials: { accessKeyId: string; secretAccessKey: string; region: string }) => Promise<void>
  hasAwsCredentialsForBedrock: (agents: Array<{ id: string; providerId: ProviderId }>) => boolean
}

function readLegacyKeys(): Record<string, string> {
  const raw = localStorage.getItem(LEGACY_STORAGE_NAME)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as {
      state?: { keys?: Record<string, unknown> }
      keys?: Record<string, unknown>
    }
    const keys = parsed.state?.keys ?? parsed.keys
    if (!keys || typeof keys !== 'object') return {}

    return Object.fromEntries(
      Object.entries(keys)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0),
    )
  } catch {
    return {}
  }
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keyStatus: {},

  hydrateStatus: (agents) => {
    set({
      keyStatus: Object.fromEntries(agents.map((agent) => [agent.id, Boolean(agent.hasApiKey)])),
    })
  },

  hasKey: (agentId) => Boolean(get().keyStatus[agentId]),

  setKey: async (agentId, apiKey) => {
    const res = await apiFetch(`/api/db/agents/${agentId}/api-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    if (!res.ok) throw new Error('Failed to save API key')

    set((state) => ({
      keyStatus: { ...state.keyStatus, [agentId]: apiKey.trim().length > 0 },
    }))
  },

  removeKey: async (agentId) => {
    const res = await apiFetch(`/api/db/agents/${agentId}/api-key`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to remove API key')

    set((state) => ({
      keyStatus: { ...state.keyStatus, [agentId]: false },
    }))
  },

  migrateLegacyLocalStorageKeys: async (agents) => {
    const legacyKeys = readLegacyKeys()
    const agentIds = new Set(agents.map((agent) => agent.id))
    const entries = Object.entries(legacyKeys).filter(([agentId]) => agentIds.has(agentId))
    if (entries.length === 0) {
      if (Object.keys(legacyKeys).length > 0) localStorage.removeItem(LEGACY_STORAGE_NAME)
      return 0
    }

    for (const [agentId, apiKey] of entries) {
      await get().setKey(agentId, apiKey)
    }

    localStorage.removeItem(LEGACY_STORAGE_NAME)
    return entries.length
  },

  hasKeyForProvider: (providerId, agents) => {
    const keyStatus = get().keyStatus
    return agents.some((agent) => agent.providerId === providerId && keyStatus[agent.id])
  },

  setAwsCredentials: async (agentId, credentials) => {
    await get().setKey(agentId, JSON.stringify(credentials))
  },

  hasAwsCredentialsForBedrock: (agents) => get().hasKeyForProvider('bedrock', agents),
}))
