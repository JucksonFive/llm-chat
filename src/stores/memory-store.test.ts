// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useMemoryStore } from './memory-store'
import type { Memory } from '@/types'

const AGENT = 'agent-1'

function makeMemories(longCount: number, shortCount = 0): Memory[] {
  const out: Memory[] = []
  for (let i = 0; i < longCount; i++) {
    out.push({
      id: `long-${i}`,
      agentId: AGENT,
      content: `long memory ${i}`,
      type: 'long',
      createdAt: 1000 + i,
    })
  }
  for (let i = 0; i < shortCount; i++) {
    out.push({
      id: `short-${i}`,
      agentId: AGENT,
      content: `short memory ${i}`,
      type: 'short',
      createdAt: 2000 + i,
    })
  }
  return out
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useMemoryStore.setState({ memories: [], loaded: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRelevantMemoryPrompt', () => {
  it('returns empty prompt when there are no memories', async () => {
    const result = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'query', 'sk-x')
    expect(result.prompt).toBe('')
    expect(result.usedMemoryIds).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips semantic search and uses all memories when no API key is provided', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    const result = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'a longer query string', '')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.prompt).toContain('long memory 0')
    expect(result.prompt).toContain('long memory 19')
    expect(result.prompt).toContain('persistent facts')
    expect(result.usedMemoryIds).toHaveLength(20)
  })

  it('skips semantic search when long-term count is at or below k', async () => {
    useMemoryStore.setState({ memories: makeMemories(5), loaded: true })
    const result = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'a longer query string', 'sk-x', 5)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.prompt).toContain('long memory 0')
    expect(result.usedMemoryIds).toHaveLength(5)
  })

  it('skips semantic search for very short queries', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    const result = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'ok', 'sk-x', 5)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.prompt).toContain('long memory 0')
    // Falls back to the legacy label.
    expect(result.prompt).toContain('persistent facts')
  })

  it('uses the semantic-search response when the server returns memories', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    const relevant: Memory[] = [
      { id: 'long-3', agentId: AGENT, content: 'most relevant memory', type: 'long', createdAt: 1003 },
    ]
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ memories: relevant }),
    })

    const result = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.prompt).toContain('most relevant memory')
    expect(result.prompt).toContain('most relevant to the current question')
    // Other long-term memories are NOT in the prompt.
    expect(result.prompt).not.toContain('long memory 19')
    expect(result.usedMemoryIds).toContain('long-3')
  })

  it('falls back to all memories when server signals fallback', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ memories: [], fallback: true, reason: 'no-api-key' }),
    })

    const result = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)
    expect(result.prompt).toContain('long memory 19')
    expect(result.prompt).toContain('persistent facts')
  })

  it('falls back to all memories when fetch throws', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const result = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)
    expect(result.prompt).toContain('long memory 0')
    expect(result.prompt).toContain('persistent facts')
  })

  it('always includes short-term memories regardless of semantic search outcome', async () => {
    useMemoryStore.setState({ memories: makeMemories(20, 3), loaded: true })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        memories: [{ id: 'long-0', agentId: AGENT, content: 'long memory 0', type: 'long', createdAt: 1000 }],
      }),
    })

    const result = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'a longer query string', 'sk-x', 5)
    expect(result.prompt).toContain('short memory 0')
    expect(result.prompt).toContain('short memory 2')
    expect(result.prompt).toContain('Short-term memories')
    expect(result.usedMemoryIds).toContain('short-0')
    expect(result.usedMemoryIds).toContain('long-0')
  })
})

describe('markMemoriesAsUsed (Phase 5)', () => {
  it('updates lastUsedAt for specified memory IDs', () => {
    useMemoryStore.setState({ memories: makeMemories(3), loaded: true })

    const beforeTime = Date.now()
    useMemoryStore.getState().markMemoriesAsUsed(['long-0', 'long-2'])

    const memories = useMemoryStore.getState().memories
    expect(memories[0].lastUsedAt).toBeGreaterThanOrEqual(beforeTime)
    expect(memories[1].lastUsedAt).toBeUndefined()
    expect(memories[2].lastUsedAt).toBeGreaterThanOrEqual(beforeTime)
  })

  it('does not affect non-matching memories', () => {
    useMemoryStore.setState({ memories: makeMemories(3), loaded: true })
    useMemoryStore.getState().markMemoriesAsUsed(['nonexistent-id'])

    const memories = useMemoryStore.getState().memories
    expect(memories.every((m) => m.lastUsedAt === undefined)).toBe(true)
  })
})

describe('getRecentlyUsedMemories (Phase 5)', () => {
  it('returns memories used within the time window', () => {
    const now = Date.now()
    useMemoryStore.setState({
      memories: [
        { id: 'm1', agentId: AGENT, content: 'recent', type: 'long', createdAt: 1, lastUsedAt: now - 1000 },
        { id: 'm2', agentId: AGENT, content: 'old', type: 'long', createdAt: 2, lastUsedAt: now - 10 * 60 * 1000 },
        { id: 'm3', agentId: AGENT, content: 'never used', type: 'long', createdAt: 3 },
      ],
      loaded: true,
    })

    const recent = useMemoryStore.getState().getRecentlyUsedMemories(AGENT)
    expect(recent).toHaveLength(1)
    expect(recent[0].id).toBe('m1')
  })

  it('respects custom withinMs window', () => {
    const now = Date.now()
    useMemoryStore.setState({
      memories: [
        { id: 'm1', agentId: AGENT, content: 'a', type: 'long', createdAt: 1, lastUsedAt: now - 30 * 1000 },
      ],
      loaded: true,
    })

    // Within 1 minute window
    expect(useMemoryStore.getState().getRecentlyUsedMemories(AGENT, 60 * 1000)).toHaveLength(1)
    // Within 10 second window — outside
    expect(useMemoryStore.getState().getRecentlyUsedMemories(AGENT, 10 * 1000)).toHaveLength(0)
  })

  it('only returns memories for the specified agent', () => {
    const now = Date.now()
    useMemoryStore.setState({
      memories: [
        { id: 'm1', agentId: AGENT, content: 'a', type: 'long', createdAt: 1, lastUsedAt: now },
        { id: 'm2', agentId: 'other-agent', content: 'b', type: 'long', createdAt: 2, lastUsedAt: now },
      ],
      loaded: true,
    })

    const recent = useMemoryStore.getState().getRecentlyUsedMemories(AGENT)
    expect(recent).toHaveLength(1)
    expect(recent[0].agentId).toBe(AGENT)
  })
})
