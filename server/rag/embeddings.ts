import { OpenAIEmbeddings } from '@langchain/openai'

/**
 * RAG embeddings client. Uses OpenAI's text-embedding-3-small (1536 dims).
 *
 * Instances are cached per API key so repeated calls during a single search
 * reuse the same HTTP client. Memory is unbounded but the cache key is the
 * API key itself — realistically a handful of unique values per process.
 */
const cache = new Map<string, OpenAIEmbeddings>()

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIM = 1536

export function getEmbeddings(apiKey: string): OpenAIEmbeddings {
  if (!apiKey) throw new Error('OpenAI API key is required for embeddings')
  const existing = cache.get(apiKey)
  if (existing) return existing
  const client = new OpenAIEmbeddings({
    apiKey,
    model: EMBEDDING_MODEL,
  })
  cache.set(apiKey, client)
  return client
}

/** Embed a single string. */
export async function embedOne(apiKey: string, text: string): Promise<number[]> {
  const client = getEmbeddings(apiKey)
  return client.embedQuery(text)
}

/** Embed many strings in one request. */
export async function embedMany(apiKey: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getEmbeddings(apiKey)
  return client.embedDocuments(texts)
}
