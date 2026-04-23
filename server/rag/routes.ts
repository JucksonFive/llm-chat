import type { Express } from 'express'
import { searchMemories } from './memory-index.js'

export function registerRagRoutes(app: Express) {
  app.post('/api/rag/memories/search', async (req, res) => {
    try {
      const { agentId, query, apiKey, k } = req.body ?? {}
      if (!agentId || typeof agentId !== 'string') {
        res.status(400).json({ error: 'agentId is required' })
        return
      }
      if (!apiKey || typeof apiKey !== 'string') {
        // No key → signal the client to fall back; not an error.
        res.json({ memories: [], fallback: true })
        return
      }
      if (typeof query !== 'string') {
        res.status(400).json({ error: 'query is required' })
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
      res.status(200).json({ memories: [], fallback: true, error: message })
    }
  })
}
