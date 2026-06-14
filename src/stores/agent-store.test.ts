// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from './agent-store'
import { useApiKeyStore } from './api-key-store'
import type { Agent } from '@/types'

const fetchMock = vi.fn()

function reset() {
  localStorage.clear()
  useAgentStore.setState({ agents: [], activeAgentId: null, loaded: false })
  useApiKeyStore.setState({ keyStatus: {} })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Default',
    providerId: 'openai',
    model: 'gpt-4o',
    hasApiKey: false,
    systemPrompt: 'You are helpful.',
    createdAt: 1,
    avatarColor: '#3b82f6',
    mcpServerIds: [],
    builtInToolIds: [],
    ...overrides,
  }
}

describe('addAgent', () => {
  it('POSTs to /api/db/agents and appends the new agent as active', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-1' }) })

    const agent = await useAgentStore.getState().addAgent({
      name: 'New Agent',
      providerId: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'be helpful',
    })

    expect(agent.id).toBe('srv-1')
    expect(agent.name).toBe('New Agent')
    expect(agent.mcpServerIds).toEqual([])
    expect(agent.builtInToolIds).toEqual([])
    expect(useAgentStore.getState().agents.map((a) => a.id)).toEqual(['srv-1'])
    expect(useAgentStore.getState().activeAgentId).toBe('srv-1')
  })

  it('cycles avatar colors via the AVATAR_COLORS palette', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ id: crypto.randomUUID() }) })

    const colors: string[] = []
    for (let i = 0; i < 9; i++) {
      const a = await useAgentStore.getState().addAgent({
        name: `A${i}`,
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'x',
      })
      colors.push(a.avatarColor)
    }
    // 8 colors → 9th wraps back to first.
    expect(colors[0]).toBe(colors[8])
    // First 8 are unique.
    expect(new Set(colors.slice(0, 8)).size).toBe(8)
  })

  it('forwards user-provided builtInToolIds', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-2' }) })
    const agent = await useAgentStore.getState().addAgent({
      name: 'tools',
      providerId: 'anthropic',
      model: 'claude-opus-4-6',
      systemPrompt: 'x',
      builtInToolIds: ['calculator', 'web-search'],
    })
    expect(agent.builtInToolIds).toEqual(['calculator', 'web-search'])
  })
})

describe('updateAgent', () => {
  it('merges updates into the matching agent and PUTs', async () => {
    fetchMock.mockResolvedValueOnce({})
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a', name: 'old' }), makeAgent({ id: 'b' })],
    })

    await useAgentStore.getState().updateAgent('a', { name: 'new', model: 'gpt-4.1' })

    const updated = useAgentStore.getState().agents.find((a) => a.id === 'a')!
    expect(updated.name).toBe('new')
    expect(updated.model).toBe('gpt-4.1')
    // Other agent untouched.
    expect(useAgentStore.getState().agents.find((a) => a.id === 'b')!.name).toBe('Default')
  })

  it('is a no-op when the agent does not exist', async () => {
    await useAgentStore.getState().updateAgent('missing', { name: 'x' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('deleteAgent', () => {
  it('removes the agent and clears active when deleting the active one', async () => {
    fetchMock.mockResolvedValueOnce({})
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })],
      activeAgentId: 'a',
    })

    await useAgentStore.getState().deleteAgent('a')

    expect(useAgentStore.getState().agents.map((a) => a.id)).toEqual(['b'])
    expect(useAgentStore.getState().activeAgentId).toBeNull()
  })

  it('preserves activeAgentId when deleting a non-active agent', async () => {
    fetchMock.mockResolvedValueOnce({})
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })],
      activeAgentId: 'a',
    })

    await useAgentStore.getState().deleteAgent('b')
    expect(useAgentStore.getState().activeAgentId).toBe('a')
  })
})

describe('setActiveAgent', () => {
  it('sets and clears the active id', () => {
    useAgentStore.getState().setActiveAgent('xyz')
    expect(useAgentStore.getState().activeAgentId).toBe('xyz')
    useAgentStore.getState().setActiveAgent(null)
    expect(useAgentStore.getState().activeAgentId).toBeNull()
  })
})

describe('loadAgents', () => {
  it('seeds the programmer template when the server returns an empty agent list', async () => {
    // 1) GET agents → []
    // 2) POST /api/db/agents → { id }
    fetchMock
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => ({ id: 'seeded' }) })

    await useAgentStore.getState().loadAgents()

    expect(useAgentStore.getState().agents).toHaveLength(1)
    expect(useAgentStore.getState().agents[0].id).toBe('seeded')
    expect(useAgentStore.getState().loaded).toBe(true)
  })

  it('keeps persisted activeAgentId when the agent still exists', async () => {
    useAgentStore.setState({ activeAgentId: 'b' })
    fetchMock
      .mockResolvedValueOnce({
        json: async () => [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })],
      })

    await useAgentStore.getState().loadAgents()
    expect(useAgentStore.getState().activeAgentId).toBe('b')
  })

  it('falls back to the first agent when persisted active no longer exists', async () => {
    useAgentStore.setState({ activeAgentId: 'gone' })
    fetchMock
      .mockResolvedValueOnce({
        json: async () => [makeAgent({ id: 'a' }), makeAgent({ id: 'b' })],
      })

    await useAgentStore.getState().loadAgents()
    expect(useAgentStore.getState().activeAgentId).toBe('a')
  })

  it('hydrates API key presence from loaded agents', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => [makeAgent({ id: 'a', hasApiKey: true }), makeAgent({ id: 'b', hasApiKey: false })],
    })

    await useAgentStore.getState().loadAgents()

    expect(useApiKeyStore.getState().hasKey('a')).toBe(true)
    expect(useApiKeyStore.getState().hasKey('b')).toBe(false)
    expect(useAgentStore.getState().agents.find((a) => a.id === 'a')?.hasApiKey).toBe(true)
  })
})
