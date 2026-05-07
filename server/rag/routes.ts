import type { Express } from 'express'
import { searchMemories } from './memory-index.js'
import { deleteIndexedDocument, listIndexedDocuments } from './document-index.js'

export type RagFallbackReason = 'no-api-key' | 'search-failed'

export function registerRagRoutes(app: Express) {
  app.get('/api/rag/documents', (_req, res) => {
    const rows = listIndexedDocuments()
    res.json({
      documents: rows.map((r) => ({
        id: r.id,
        path: r.path,
        chunkCount: r.chunk_count,
        mtime: r.mtime,
        indexedAt: r.indexed_at,
      })),
    })
  })

  app.delete('/api/rag/documents/:id', (req, res) => {
    const ok = deleteIndexedDocument(req.params.id)
    if (!ok) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ ok: true })
  })

  app.post('/api/rag/memories/search', async (req, res) => {
    try {
      const { agentId, query, apiKey, k } = req.body ?? {}
      if (!agentId || typeof agentId !== 'string') {
        res.status(400).json({ error: 'agentId is required' })
        return
      }
      if (typeof query !== 'string') {
        res.status(400).json({ error: 'query is required' })
        return
      }
      if (!apiKey || typeof apiKey !== 'string') {
        // No key → signal the client to fall back. Not an error.
        res.json({ memories: [], fallback: true, reason: 'no-api-key' satisfies RagFallbackReason })
        return
      }

      const memories = await searchMemories({
        apiKey,
        agentId,
        query,
        k: typeof k === 'number' ? Math.max(1, Math.min(20, k)) : 5,
      })
      res.json({ memories })
    } catch (err) {
      console.error('[rag] memories/search failed:', err)
      const message = err instanceof Error ? err.message : 'Search failed'
      // Fall back cleanly: the client will use the non-semantic prompt.
      res.status(200).json({
        memories: [],
        fallback: true,
        reason: 'search-failed' satisfies RagFallbackReason,
        error: message,
      })
    }
  })
}
