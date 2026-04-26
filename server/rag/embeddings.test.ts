import { describe, it, expect, vi, beforeEach } from 'vitest'

const embedDocuments = vi.fn(async (texts: string[]) => texts.map(() => new Array(1536).fill(0)))
const embedQuery = vi.fn(async (_text: string) => new Array(1536).fill(0))

vi.mock('@langchain/openai', () => {
  class OpenAIEmbeddings {
    embedDocuments = embedDocuments
    embedQuery = embedQuery
    constructor(_opts: unknown) {}
  }
  return { OpenAIEmbeddings }
})

// Import after the mock is registered.
const { embedMany, embedOne, getEmbeddings } = await import('./embeddings.js')

beforeEach(() => {
  embedDocuments.mockClear()
  embedQuery.mockClear()
})

describe('getEmbeddings', () => {
  it('caches clients per API key', () => {
    const a1 = getEmbeddings('sk-a')
    const a2 = getEmbeddings('sk-a')
    const b1 = getEmbeddings('sk-b')
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b1)
  })

  it('throws when API key is empty', () => {
    expect(() => getEmbeddings('')).toThrow(/API key/i)
  })
})

describe('embedMany', () => {
  it('returns empty array without calling the client when input is empty', async () => {
    const result = await embedMany('sk-test', [])
    expect(result).toEqual([])
    expect(embedDocuments).not.toHaveBeenCalled()
  })

  it('makes a single call when input is at or below batch size', async () => {
    const texts = Array.from({ length: 100 }, (_, i) => `text ${i}`)
    await embedMany('sk-test', texts)
    expect(embedDocuments).toHaveBeenCalledTimes(1)
    expect(embedDocuments).toHaveBeenCalledWith(texts)
  })

  it('chunks inputs over 100 into batches of 100', async () => {
    const texts = Array.from({ length: 250 }, (_, i) => `text ${i}`)
    const result = await embedMany('sk-test', texts)
    expect(embedDocuments).toHaveBeenCalledTimes(3)
    expect((embedDocuments.mock.calls[0][0] as string[]).length).toBe(100)
    expect((embedDocuments.mock.calls[1][0] as string[]).length).toBe(100)
    expect((embedDocuments.mock.calls[2][0] as string[]).length).toBe(50)
    expect(result.length).toBe(250)
  })
})

describe('embedOne', () => {
  it('delegates to embedQuery', async () => {
    await embedOne('sk-test', 'hello')
    expect(embedQuery).toHaveBeenCalledTimes(1)
    expect(embedQuery).toHaveBeenCalledWith('hello')
  })
})
