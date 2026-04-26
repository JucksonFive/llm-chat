import { describe, it, expect } from 'vitest'
import { encodeEmbedding, decodeEmbedding, cosine } from './vector-store.js'
import { EMBEDDING_DIM } from './embeddings.js'

function makeVec(fill: (i: number) => number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => fill(i))
}

function unitVec(direction: number[]): Float32Array {
  const norm = Math.sqrt(direction.reduce((s, x) => s + x * x, 0))
  const out = new Float32Array(EMBEDDING_DIM)
  for (let i = 0; i < direction.length; i++) out[i] = direction[i] / norm
  return out
}

describe('encodeEmbedding / decodeEmbedding', () => {
  it('roundtrips a Float32 vector with full precision', () => {
    const original = makeVec((i) => Math.sin(i * 0.13))
    const blob = encodeEmbedding(original)
    const decoded = decodeEmbedding(blob)
    expect(decoded.length).toBe(EMBEDDING_DIM)
    // Float32 truncation is the only loss; compare with that tolerance.
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      expect(decoded[i]).toBeCloseTo(original[i], 5)
    }
  })

  it('throws on wrong dimensions', () => {
    expect(() => encodeEmbedding([1, 2, 3])).toThrow(/Embedding length mismatch/)
    expect(() => encodeEmbedding(makeVec((i) => i + 1))).not.toThrow()
  })

  it('decode produces a fresh ArrayBuffer (no aliasing)', () => {
    const blob = encodeEmbedding(makeVec(() => 0.5))
    const decoded = decodeEmbedding(blob)
    decoded[0] = 999
    // Re-decoding the original blob is unaffected.
    expect(decodeEmbedding(blob)[0]).toBeCloseTo(0.5, 5)
  })
})

describe('cosine', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = unitVec([1, 0, 0, 0])
    expect(cosine(v, v)).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = unitVec([1, 0, 0, 0])
    const b = unitVec([0, 1, 0, 0])
    expect(cosine(a, b)).toBeCloseTo(0, 5)
  })

  it('returns -1 for opposite unit vectors', () => {
    const a = unitVec([1, 0, 0, 0])
    const b = unitVec([-1, 0, 0, 0])
    expect(cosine(a, b)).toBeCloseTo(-1, 5)
  })

  it('handles non-unit vectors (defensive normalization)', () => {
    const a = new Float32Array(EMBEDDING_DIM)
    const b = new Float32Array(EMBEDDING_DIM)
    a[0] = 3
    b[0] = 5
    // 3·5 / (3·5) = 1 — orientation alone matters.
    expect(cosine(a, b)).toBeCloseTo(1, 5)
  })

  it('returns 0 when either vector is zero', () => {
    const a = new Float32Array(EMBEDDING_DIM)
    const b = unitVec([1, 0, 0, 0])
    expect(cosine(a, b)).toBe(0)
  })

  it('ranks more-similar vectors higher than less-similar ones', () => {
    const query = unitVec([1, 1, 0, 0])
    const close = unitVec([1, 0.9, 0, 0])
    const far = unitVec([0.1, 0, 1, 0])
    expect(cosine(query, close)).toBeGreaterThan(cosine(query, far))
  })
})
