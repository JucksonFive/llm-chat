import { ChatOpenAI } from '@langchain/openai'
import crypto from 'node:crypto'

/**
 * Helpers used by `web-search` to improve precision:
 *
 *   1. {@link rewriteQuery} — expand a single user query into 3–4 diverse
 *      variants via a small LLM. The original query is always included as a
 *      safety net.
 *   2. {@link fuseResults} — combine multiple ranked result lists with
 *      Reciprocal Rank Fusion (RRF) and dedup by URL.
 *   3. {@link rerankResults} — re-order fused results by relevance to the
 *      original query using an LLM.
 *
 * All LLM-backed functions fall back to a sensible no-op if the API call
 * fails, so web search keeps working even when OpenAI is unreachable or no
 * key is configured.
 */

export interface RankableResult {
  title: string
  url: string
  snippet: string
}

const REWRITER_MODEL = process.env.WEB_SEARCH_REWRITE_MODEL || 'gpt-4.1-nano'
const RERANKER_MODEL = process.env.WEB_SEARCH_RERANK_MODEL || 'gpt-4.1-nano'

// Cache ChatOpenAI instances per (apiKey, model) so repeated tool calls during
// a single chat reuse the same HTTP client. The cache key is a SHA-256 of the
// API key, so a stray `console.log(cache)` won't dump credentials.
const clientCache = new Map<string, ChatOpenAI>()

function getClient(apiKey: string, model: string, temperature: number): ChatOpenAI {
  const cacheKey = `${crypto.createHash('sha256').update(apiKey).digest('hex')}:${model}:${temperature}`
  const existing = clientCache.get(cacheKey)
  if (existing) return existing
  const client = new ChatOpenAI({ apiKey, model, temperature })
  clientCache.set(cacheKey, client)
  return client
}

const REWRITE_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 4,
      description: 'Diverse rephrasings of the original query.',
    },
  },
  required: ['queries'],
  additionalProperties: false,
} as const

const RERANK_SCHEMA = {
  type: 'object',
  properties: {
    order: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Result indices in descending order of relevance.',
    },
  },
  required: ['order'],
  additionalProperties: false,
} as const

/**
 * Generate diverse search-query variants. The returned array always starts
 * with the original `query` so callers can rely on at least one usable query
 * even if the LLM call fails.
 */
export async function rewriteQuery(apiKey: string, query: string): Promise<string[]> {
  if (!apiKey) return [query]
  try {
    const client = getClient(apiKey, REWRITER_MODEL, 0.3)
    const structured = client.withStructuredOutput<{ queries: string[] }>(REWRITE_SCHEMA)
    const result = await structured.invoke([
      {
        role: 'system',
        content:
          'You generate diverse web-search query variants. Given a user question, return 3 alternative search queries that approach the topic from different angles (synonyms, more specific phrasing, related terms). Keep each query concise (under 12 words). Do not repeat the original verbatim.',
      },
      { role: 'user', content: `Question: ${query}` },
    ])

    const variants = (result?.queries ?? [])
      .map((q) => q?.trim())
      .filter((q): q is string => Boolean(q) && q.toLowerCase() !== query.toLowerCase())

    // Dedup while preserving order; original always first.
    const seen = new Set<string>([query.toLowerCase()])
    const out = [query]
    for (const v of variants) {
      const key = v.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(v)
      }
      if (out.length >= 4) break
    }
    return out
  } catch (err) {
    console.warn('[web-search] query rewrite failed, falling back to original:', err instanceof Error ? err.message : err)
    return [query]
  }
}

/**
 * Reciprocal Rank Fusion: combine multiple ranked lists into a single ranked
 * list. For each unique URL we sum `1 / (k + rank_i)` across the lists it
 * appears in (rank is 0-based). Higher score = more relevant.
 *
 * @param perQueryResults  Ranked result lists, one per query variant.
 * @param k                RRF damping constant (default 60, the standard
 *                         value from Cormack et al. 2009).
 */
export function fuseResults<T extends RankableResult>(perQueryResults: T[][], k = 60): T[] {
  const scores = new Map<string, number>()
  const firstSeen = new Map<string, T>()

  for (const list of perQueryResults) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank]
      if (!result?.url) continue
      const url = result.url
      const contribution = 1 / (k + rank)
      scores.set(url, (scores.get(url) ?? 0) + contribution)
      if (!firstSeen.has(url)) firstSeen.set(url, result)
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => firstSeen.get(url)!)
}

/**
 * Re-rank `results` against the original `query` using an LLM. Returns at
 * most `topK` results in descending relevance order. On any failure (no key,
 * API error, malformed output) falls back to `results.slice(0, topK)`.
 */
export async function rerankResults<T extends RankableResult>(
  apiKey: string,
  query: string,
  results: T[],
  topK: number,
): Promise<T[]> {
  if (!apiKey || results.length === 0) return results.slice(0, topK)
  if (results.length <= 1) return results.slice(0, topK)

  try {
    const client = getClient(apiKey, RERANKER_MODEL, 0)
    const structured = client.withStructuredOutput<{ order: number[] }>(RERANK_SCHEMA)

    const numbered = results
      .map((r, i) => {
        const snippet = (r.snippet || '').slice(0, 240).replace(/\s+/g, ' ').trim()
        return `[${i}] ${r.title}\n${snippet}`
      })
      .join('\n\n')

    const response = await structured.invoke([
      {
        role: 'system',
        content:
          'You rerank search results by relevance to a user question. Return a JSON object {"order": [...]} listing result indices from most to least relevant. Use only the provided indices; do not invent new ones.',
      },
      {
        role: 'user',
        content: `Question: ${query}\n\nResults:\n${numbered}`,
      },
    ])

    const order = response?.order ?? []
    const seen = new Set<number>()
    const reordered: T[] = []
    for (const idx of order) {
      if (Number.isInteger(idx) && idx >= 0 && idx < results.length && !seen.has(idx)) {
        seen.add(idx)
        reordered.push(results[idx])
        if (reordered.length >= topK) break
      }
    }
    if (reordered.length === 0) return results.slice(0, topK)

    // If the LLM returned fewer than topK, top up with any remaining results
    // in their original order so callers always get up to topK items.
    if (reordered.length < topK) {
      for (let i = 0; i < results.length && reordered.length < topK; i++) {
        if (!seen.has(i)) reordered.push(results[i])
      }
    }
    return reordered
  } catch (err) {
    console.warn('[web-search] rerank failed, falling back to fusion order:', err instanceof Error ? err.message : err)
    return results.slice(0, topK)
  }
}
