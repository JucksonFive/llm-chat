import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const withStructuredOutput = vi.fn(() => ({ invoke }))

vi.mock('@langchain/openai', () => {
  class ChatOpenAI {
    withStructuredOutput = withStructuredOutput
  }
  return { ChatOpenAI }
})

// Import after the mock is registered.
const { rewriteQuery, fuseResults, rerankResults } = await import('./web-search-rewrite.js')

beforeEach(() => {
  invoke.mockReset()
  withStructuredOutput.mockClear()
})

describe('fuseResults (Reciprocal Rank Fusion)', () => {
  const r = (url: string, title = url) => ({ url, title, snippet: '' })

  it('returns an empty array for no input', () => {
    expect(fuseResults([])).toEqual([])
  })

  it('preserves order for a single list', () => {
    const list = [r('a'), r('b'), r('c')]
    expect(fuseResults([list]).map((x) => x.url)).toEqual(['a', 'b', 'c'])
  })

  it('ranks URLs that appear in multiple lists higher', () => {
    const fused = fuseResults([
      [r('a'), r('b'), r('c')],
      [r('b'), r('d'), r('a')],
    ])
    // 'a' and 'b' appear in both lists; 'b' should rank above 'a' because
    // it has a better combined rank.
    expect(fused.map((x) => x.url).slice(0, 2)).toEqual(['b', 'a'])
    expect(new Set(fused.map((x) => x.url))).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('dedups by URL and keeps the first-seen result object', () => {
    const first = { url: 'x', title: 'first', snippet: '' }
    const second = { url: 'x', title: 'second', snippet: '' }
    const fused = fuseResults([[first], [second]])
    expect(fused).toHaveLength(1)
    expect(fused[0]).toBe(first)
  })

  it('skips entries without a url', () => {
    const fused = fuseResults([[{ url: '', title: 't', snippet: '' }, r('y')]])
    expect(fused.map((x) => x.url)).toEqual(['y'])
  })
})

describe('rewriteQuery', () => {
  it('returns just the original query when no apiKey is provided', async () => {
    const out = await rewriteQuery('', 'how does rrf work')
    expect(out).toEqual(['how does rrf work'])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('falls back to the original query when the LLM call fails', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'))
    const out = await rewriteQuery('sk-test', 'how does rrf work')
    expect(out).toEqual(['how does rrf work'])
  })

  it('prepends the original query, dedups, and caps at 4', async () => {
    invoke.mockResolvedValueOnce({
      queries: ['rrf algorithm explained', 'reciprocal rank fusion', 'How does RRF work', 'rrf algorithm explained', 'extra one', 'sixth'],
    })
    const out = await rewriteQuery('sk-test', 'how does rrf work')
    expect(out[0]).toBe('how does rrf work')
    expect(out).toHaveLength(4)
    expect(out).toContain('rrf algorithm explained')
    expect(out).toContain('reciprocal rank fusion')
    // Case-insensitive duplicate of the original is filtered out.
    expect(out).not.toContain('How does RRF work')
    // No duplicates.
    expect(new Set(out).size).toBe(out.length)
  })

  it('returns just the original when the LLM returns no usable variants', async () => {
    invoke.mockResolvedValueOnce({ queries: ['', '   '] })
    const out = await rewriteQuery('sk-test', 'q')
    expect(out).toEqual(['q'])
  })
})

describe('rerankResults', () => {
  const r = (url: string, title = url) => ({ url, title, snippet: '' })

  it('returns the original slice when no apiKey is provided', async () => {
    const out = await rerankResults('', 'q', [r('a'), r('b'), r('c')], 2)
    expect(out.map((x) => x.url)).toEqual(['a', 'b'])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('skips the LLM call when there is at most one result', async () => {
    const out = await rerankResults('sk-test', 'q', [r('only')], 5)
    expect(out.map((x) => x.url)).toEqual(['only'])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reorders results according to the LLM output', async () => {
    invoke.mockResolvedValueOnce({ order: [2, 0, 1] })
    const out = await rerankResults('sk-test', 'q', [r('a'), r('b'), r('c')], 3)
    expect(out.map((x) => x.url)).toEqual(['c', 'a', 'b'])
  })

  it('truncates to topK', async () => {
    invoke.mockResolvedValueOnce({ order: [2, 0, 1] })
    const out = await rerankResults('sk-test', 'q', [r('a'), r('b'), r('c')], 2)
    expect(out.map((x) => x.url)).toEqual(['c', 'a'])
  })

  it('ignores invalid indices and dedups, then tops up from the original order', async () => {
    invoke.mockResolvedValueOnce({ order: [99, 1, 1, -1] })
    const out = await rerankResults('sk-test', 'q', [r('a'), r('b'), r('c')], 3)
    // b first (only valid index), then a and c topped up from original order.
    expect(out.map((x) => x.url)).toEqual(['b', 'a', 'c'])
  })

  it('falls back to the original slice when the LLM call fails', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'))
    const out = await rerankResults('sk-test', 'q', [r('a'), r('b'), r('c')], 2)
    expect(out.map((x) => x.url)).toEqual(['a', 'b'])
  })

  it('falls back when the LLM returns no usable indices', async () => {
    invoke.mockResolvedValueOnce({ order: [42, -7] })
    const out = await rerankResults('sk-test', 'q', [r('a'), r('b')], 2)
    expect(out.map((x) => x.url)).toEqual(['a', 'b'])
  })
})
