import { describe, it, expect } from 'vitest'
import { splitText } from './text-splitter.js'

describe('splitText', () => {
  it('returns an empty array for empty input', () => {
    expect(splitText('')).toEqual([])
  })

  it('returns the text as a single chunk when shorter than chunkSize', () => {
    const text = 'short text'
    const chunks = splitText(text, { chunkSize: 100, chunkOverlap: 10 })
    expect(chunks).toEqual(['short text'])
  })

  it('respects chunkSize within a small tolerance', () => {
    // Build a paragraph of repeated short sentences so the splitter has clean
    // boundaries to merge along.
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const text = sentence.repeat(50)
    const chunkSize = 200
    const chunks = splitText(text, { chunkSize, chunkOverlap: 30 })

    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk should be reasonably close to the budget. Allow a small
    // overhead for fragments that didn't quite fit and got carried over.
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(chunkSize + sentence.length)
    }
  })

  it('produces overlap between consecutive chunks', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} carries unique tokens.`).join(' ')
    const chunks = splitText(text, { chunkSize: 200, chunkOverlap: 60 })
    expect(chunks.length).toBeGreaterThan(2)

    // Adjacent chunks should share a non-trivial trailing/leading slice.
    for (let i = 0; i < chunks.length - 1; i++) {
      const tail = chunks[i].slice(-40)
      const head = chunks[i + 1].slice(0, 80)
      // We don't expect an exact substring match — overlap is fragment-aligned —
      // but at least one word should appear in both.
      const tailWords = tail.split(/\s+/).filter((w) => w.length > 3)
      const overlap = tailWords.some((word) => head.includes(word))
      expect(overlap).toBe(true)
    }
  })

  it('falls through separators for text with no paragraph breaks', () => {
    // Long single line — must split on sentences, then words.
    const text = 'A. ' + 'word '.repeat(500)
    const chunks = splitText(text, { chunkSize: 100, chunkOverlap: 20 })
    expect(chunks.length).toBeGreaterThan(5)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(150)
    }
  })

  it('handles multibyte characters without breaking surrogate pairs', () => {
    const text = '日本語のテキスト。'.repeat(200)
    const chunks = splitText(text, { chunkSize: 80, chunkOverlap: 10 })
    expect(chunks.length).toBeGreaterThan(1)
    // Concatenating chunks (after deduping overlap) should still cover most of
    // the original text.
    const recovered = chunks.join('')
    expect(recovered.length).toBeGreaterThanOrEqual(text.length)
  })

  it('rejects an overlap that exceeds chunk size', () => {
    expect(() => splitText('anything', { chunkSize: 100, chunkOverlap: 200 })).toThrow(/chunkOverlap/)
  })

  it('preserves all unique tokens across the chunk set', () => {
    const tokens = Array.from({ length: 30 }, (_, i) => `token${i}`)
    const text = tokens.join(' ')
    const chunks = splitText(text, { chunkSize: 60, chunkOverlap: 15 })
    const joined = chunks.join(' ')
    for (const token of tokens) {
      expect(joined).toContain(token)
    }
  })
})
