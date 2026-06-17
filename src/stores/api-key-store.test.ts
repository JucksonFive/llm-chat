// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiKeyStore } from './api-key-store'
import type { Agent } from '@/types'

const fetchMock = vi.fn()

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Agent',
    providerId: 'openai',
    model: 'gpt-4o',
    hasApiKey: false,
    systemPrompt: '',
    createdAt: 1,
    avatarColor: '#6366f1',
    mcpServerIds: [],
    builtInToolIds: [],
    ...overrides,
  }
}

function reset() {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useApiKeyStore.setState({ keyStatus: {} })
}

beforeEach(reset)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useApiKeyStore', () => {
  it('stores only key presence in memory', () => {
    useApiKeyStore.getState().hydrateStatus([
      makeAgent({ id: 'agent-1', hasApiKey: true }),
      makeAgent({ id: 'agent-2', hasApiKey: false }),
    ])

    expect(useApiKeyStore.getState().keyStatus).toEqual({
      'agent-1': true,
      'agent-2': false,
    })
    expect(localStorage.getItem('llm-chat-api-keys')).toBeNull()
  })

  it('setKey writes through to the server and does not write localStorage', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, hasApiKey: true }) })

    await useApiKeyStore.getState().setKey('agent-1', 'sk-aaa')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/db/agents/agent-1/api-key',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ apiKey: 'sk-aaa' }),
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-LLM-Chat-Client')).toBe('1')
    expect(useApiKeyStore.getState().hasKey('agent-1')).toBe(true)
    expect(localStorage.getItem('llm-chat-api-keys')).toBeNull()
  })

  it('removeKey clears server storage and local key presence', async () => {
    useApiKeyStore.setState({ keyStatus: { 'agent-1': true, 'agent-2': true } })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, hasApiKey: false }) })

    await useApiKeyStore.getState().removeKey('agent-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/db/agents/agent-1/api-key',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(useApiKeyStore.getState().hasKey('agent-1')).toBe(false)
    expect(useApiKeyStore.getState().hasKey('agent-2')).toBe(true)
  })

  it('hasKeyForProvider returns true when any matching agent has a saved key', () => {
    const agents = [
      makeAgent({ id: 'a1', providerId: 'openai' }),
      makeAgent({ id: 'a2', providerId: 'anthropic' }),
      makeAgent({ id: 'a3', providerId: 'openai' }),
    ]
    useApiKeyStore.setState({ keyStatus: { a3: true } })

    expect(useApiKeyStore.getState().hasKeyForProvider('openai', agents)).toBe(true)
    expect(useApiKeyStore.getState().hasKeyForProvider('google', agents)).toBe(false)
  })

  it('migrates legacy localStorage keys to server storage and removes them', async () => {
    const legacy = {
      state: {
        keys: {
          a1: 'sk-openai',
          missing: 'sk-stale',
        },
      },
      version: 1,
    }
    localStorage.setItem('llm-chat-api-keys', JSON.stringify(legacy))
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, hasApiKey: true }) })

    const count = await useApiKeyStore.getState().migrateLegacyLocalStorageKeys([
      makeAgent({ id: 'a1' }),
    ])

    expect(count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/db/agents/a1/api-key')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ apiKey: 'sk-openai' })
    expect(localStorage.getItem('llm-chat-api-keys')).toBeNull()
    expect(useApiKeyStore.getState().hasKey('a1')).toBe(true)
  })

  it('stores Bedrock credentials through the same encrypted server endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, hasApiKey: true }) })

    await useApiKeyStore.getState().setAwsCredentials('bedrock-agent', {
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      region: 'eu-west-1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/db/agents/bedrock-agent/api-key')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      apiKey: JSON.stringify({
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        region: 'eu-west-1',
      }),
    })
    expect(useApiKeyStore.getState().hasKey('bedrock-agent')).toBe(true)
  })
})
