import { query } from '../db.js'
import { embedMany, embedOne } from './embeddings.js'
import {
  deleteBySource,
  getIndexedSourceIds,
  searchVectors,
  upsertVector,
  type SearchHit,
} from './vector-store.js'

/**
 * Lazy indexer for agent memories.
 *
 * Memories are stored in the `memories` table by the existing CRUD routes.
 * We do not require an OpenAI key at memory-creation time — instead, the
 * first time a semantic search is issued for an agent we embed any memories
 * that lack a vector, in one batched request.
 *
 * This keeps the existing memory CRUD free of new required parameters and
 * makes the whole feature gracefully degrade when no OpenAI key is present.
 */

interface MemoryRow {
  id: string
  agent_id: string
  content: string
  type: string
  created_at: number
}

export interface RelevantMemory {
  id: string
  agentId: string
  content: string
  type: 'short' | 'long'
  createdAt: number
  score: number
}

/** Ensure every memory for this agent has an embedding in the vectors table. */
async function syncAgentMemories(apiKey: string, agentId: string): Promise<void> {
  const rows = query<MemoryRow>(
    'SELECT id, agent_id, content, type, created_at FROM memories WHERE agent_id=$agentId',
    { agentId },
  )
  if (rows.length === 0) return

  const ids = rows.map((r) => r.id)
  const indexed = getIndexedSourceIds('memory', ids)
  const missing = rows.filter((r) => !indexed.has(r.id))
  if (missing.length === 0) return

  const embeddings = await embedMany(apiKey, missing.map((r) => r.content))
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i]
    upsertVector({
      id: `mem:${row.id}`,
      sourceType: 'memory',
      sourceId: row.id,
      agentId: row.agent_id,
      content: row.content,
      embedding: embeddings[i],
      metadata: { type: row.type },
    })
  }
}

export async function searchMemories(params: {
  apiKey: string
  agentId: string
  query: string
  k?: number
}): Promise<RelevantMemory[]> {
  const { apiKey, agentId, query: queryText, k = 5 } = params
  if (!queryText.trim()) return []

  await syncAgentMemories(apiKey, agentId)
  const queryEmbedding = await embedOne(apiKey, queryText)
  const hits = searchVectors({
    sourceType: 'memory',
    agentId,
    queryEmbedding,
    k,
  })

  return hits.map(hitToMemory).filter((m): m is RelevantMemory => m !== null)
}

function hitToMemory(hit: SearchHit): RelevantMemory | null {
  // Look up the memory row to get the latest content/type (vectors cache them
  // but the source of truth is the memories table).
  const row = query<MemoryRow>('SELECT * FROM memories WHERE id=$id', { id: hit.sourceId })[0]
  if (!row) {
    // Vector points to a deleted memory — clean up.
    deleteBySource('memory', hit.sourceId)
    return null
  }
  return {
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    type: (row.type as 'short' | 'long') ?? 'long',
    createdAt: row.created_at,
    score: hit.score,
  }
}
