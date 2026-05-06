import { run, query } from '../db.js'
import { EMBEDDING_DIM } from './embeddings.js'

/**
 * Pure-JS vector store backed by the sql.js `vectors` table.
 *
 * sqlite-vec (the typical C extension) is not usable with sql.js because
 * sql.js is a WebAssembly build that cannot load native extensions. For the
 * volumes we expect (memories in the hundreds per user, later documents in
 * the low thousands) a linear cosine scan is plenty fast and avoids the
 * packaging complexity.
 */

export type VectorSourceType = 'memory' | 'document' | 'message'

export interface VectorRow {
  id: string
  sourceType: VectorSourceType
  sourceId: string
  agentId: string | null
  content: string
  metadata: Record<string, unknown>
  createdAt: number
}

export interface SearchHit extends VectorRow {
  score: number
}

// ─── Serialization ──────────────────────────────────────
// These helpers are exported for tests; they have no side effects.

export function encodeEmbedding(vec: number[]): Uint8Array {
  if (vec.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding length mismatch: expected ${EMBEDDING_DIM}, got ${vec.length}`)
  }
  const f = new Float32Array(vec)
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength)
}

export function decodeEmbedding(blob: Uint8Array): Float32Array {
  // Copy to a fresh ArrayBuffer so alignment is guaranteed.
  const copy = new Uint8Array(blob.byteLength)
  copy.set(blob)
  return new Float32Array(copy.buffer)
}

export function cosine(a: Float32Array, b: Float32Array): number {
  // text-embedding-3-small returns L2-normalized vectors, so cosine
  // similarity reduces to a plain dot product. We still defensively divide
  // by the magnitudes if either vector is non-unit (e.g. a future provider).
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  // Treat as unit vectors when both norms are within float tolerance of 1.
  if (Math.abs(normA - 1) < 1e-3 && Math.abs(normB - 1) < 1e-3) return dot
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── Write ──────────────────────────────────────────────

export interface UpsertInput {
  id: string
  sourceType: VectorSourceType
  sourceId: string
  agentId?: string | null
  content: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

export function upsertVector(input: UpsertInput): void {
  const blob = encodeEmbedding(input.embedding)
  run(
    `INSERT INTO vectors (id, source_type, source_id, agent_id, content, embedding, metadata, created_at)
     VALUES ($id, $sourceType, $sourceId, $agentId, $content, $embedding, $metadata, $createdAt)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       embedding = excluded.embedding,
       metadata = excluded.metadata`,
    {
      id: input.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      agentId: input.agentId ?? null,
      content: input.content,
      embedding: blob,
      metadata: JSON.stringify(input.metadata ?? {}),
      createdAt: Date.now(),
    },
  )
}

export function deleteVector(id: string): void {
  run('DELETE FROM vectors WHERE id=$id', { id })
}

export function deleteBySource(sourceType: VectorSourceType, sourceId: string): void {
  run('DELETE FROM vectors WHERE source_type=$sourceType AND source_id=$sourceId', {
    sourceType,
    sourceId,
  })
}

// ─── Read ───────────────────────────────────────────────

interface RawRow {
  id: string
  source_type: string
  source_id: string
  agent_id: string | null
  content: string
  embedding: Uint8Array
  metadata: string
  created_at: number
}

function parseRow(row: RawRow): VectorRow & { embedding: Float32Array } {
  return {
    id: row.id,
    sourceType: row.source_type as VectorSourceType,
    sourceId: row.source_id,
    agentId: row.agent_id,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: row.created_at,
    embedding: decodeEmbedding(row.embedding),
  }
}

export interface SearchOptions {
  sourceType: VectorSourceType
  agentId?: string
  /** Restrict the candidate set to a single source (e.g. one indexed document). */
  sourceId?: string
  queryEmbedding: number[]
  k?: number
}

export function searchVectors({ sourceType, agentId, sourceId, queryEmbedding, k = 5 }: SearchOptions): SearchHit[] {
  const rows = sourceId
    ? query<RawRow>(
        'SELECT * FROM vectors WHERE source_type=$sourceType AND source_id=$sourceId',
        { sourceType, sourceId },
      )
    : agentId
    ? query<RawRow>(
        'SELECT * FROM vectors WHERE source_type=$sourceType AND agent_id=$agentId',
        { sourceType, agentId },
      )
    : query<RawRow>('SELECT * FROM vectors WHERE source_type=$sourceType', { sourceType })

  if (rows.length === 0) return []

  const q = new Float32Array(queryEmbedding)
  const scored = rows.map((raw) => {
    const parsed = parseRow(raw)
    const score = cosine(q, parsed.embedding)
    return {
      id: parsed.id,
      sourceType: parsed.sourceType,
      sourceId: parsed.sourceId,
      agentId: parsed.agentId,
      content: parsed.content,
      metadata: parsed.metadata,
      createdAt: parsed.createdAt,
      score,
    }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

/** Return the subset of `sourceIds` that already have a vector for this type. */
export function getIndexedSourceIds(sourceType: VectorSourceType, sourceIds: string[]): Set<string> {
  if (sourceIds.length === 0) return new Set()
  // sql.js does not expand arrays in named params, so fetch the full set for
  // this type and filter in JS. The vectors table is small per agent.
  const rows = query<{ source_id: string }>(
    'SELECT source_id FROM vectors WHERE source_type=$sourceType',
    { sourceType },
  )
  const indexed = new Set(rows.map((r) => r.source_id))
  const result = new Set<string>()
  for (const id of sourceIds) {
    if (indexed.has(id)) result.add(id)
  }
  return result
}
