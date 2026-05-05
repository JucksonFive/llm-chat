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
  it('returns empty string when there are no memories', async () => {
    const prompt = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'query', 'sk-x')
    expect(prompt).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips semantic search and uses all memories when no API key is provided', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    const prompt = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'a longer query string', '')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prompt).toContain('long memory 0')
    expect(prompt).toContain('long memory 19')
    expect(prompt).toContain('persistent facts')
  })

  it('skips semantic search when long-term count is at or below k', async () => {
    useMemoryStore.setState({ memories: makeMemories(5), loaded: true })
    const prompt = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'a longer query string', 'sk-x', 5)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prompt).toContain('long memory 0')
  })

  it('skips semantic search for very short queries', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    const prompt = await useMemoryStore.getState().getRelevantMemoryPrompt(AGENT, 'ok', 'sk-x', 5)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prompt).toContain('long memory 0')
    // Falls back to the legacy label.
    expect(prompt).toContain('persistent facts')
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

    const prompt = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(prompt).toContain('most relevant memory')
    expect(prompt).toContain('most relevant to the current question')
    // Other long-term memories are NOT in the prompt.
    expect(prompt).not.toContain('long memory 19')
  })

  it('falls back to all memories when server signals fallback', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ memories: [], fallback: true, reason: 'no-api-key' }),
    })

    const prompt = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)
    expect(prompt).toContain('long memory 19')
    expect(prompt).toContain('persistent facts')
  })

  it('falls back to all memories when fetch throws', async () => {
    useMemoryStore.setState({ memories: makeMemories(20), loaded: true })
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const prompt = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'tell me about my pet', 'sk-x', 5)
    expect(prompt).toContain('long memory 0')
    expect(prompt).toContain('persistent facts')
  })

  it('always includes short-term memories regardless of semantic search outcome', async () => {
    useMemoryStore.setState({ memories: makeMemories(20, 3), loaded: true })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        memories: [{ id: 'long-0', agentId: AGENT, content: 'long memory 0', type: 'long', createdAt: 1000 }],
      }),
    })

    const prompt = await useMemoryStore
      .getState()
      .getRelevantMemoryPrompt(AGENT, 'a longer query string', 'sk-x', 5)
    expect(prompt).toContain('short memory 0')
    expect(prompt).toContain('short memory 2')
    expect(prompt).toContain('Short-term memories')
  })
})
