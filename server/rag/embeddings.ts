import { OpenAIEmbeddings } from '@langchain/openai'
import crypto from 'node:crypto'

/**
 * RAG embeddings client. Uses OpenAI's text-embedding-3-small (1536 dims).
 *
 * Instances are cached per API key so repeated calls during a single search
 * reuse the same HTTP client. The cache key is a SHA-256 of the API key, so
 * a stray `console.log(cache)` won't dump credentials.
 */
const cache = new Map<string, OpenAIEmbeddings>()

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536
// OpenAI accepts up to 2048 inputs per /v1/embeddings request. We stay well
// below that and below the per-request token cap by chunking.
const EMBED_BATCH_SIZE = 100

function cacheKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export function getEmbeddings(apiKey: string): OpenAIEmbeddings {
  if (!apiKey) throw new Error('OpenAI API key is required for embeddings')
  const k = cacheKey(apiKey)
  const existing = cache.get(k)
  if (existing) return existing
  const client = new OpenAIEmbeddings({
    apiKey,
    model: EMBEDDING_MODEL,
  })
  cache.set(k, client)
  return client
}

/** Embed a single string. */
export async function embedOne(apiKey: string, text: string): Promise<number[]> {
  const client = getEmbeddings(apiKey)
  return client.embedQuery(text)
}

/** Embed many strings, batching to stay within OpenAI's per-request limits. */
export async function embedMany(apiKey: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getEmbeddings(apiKey)
  if (texts.length <= EMBED_BATCH_SIZE) return client.embedDocuments(texts)

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const embeddings = await client.embedDocuments(batch)
    out.push(...embeddings)
  }
  return out
}
