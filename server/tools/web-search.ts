import { tool, jsonSchema } from 'ai'
import { fuseResults, rerankResults, rewriteQuery } from './web-search-rewrite.js'
import { safeFetch } from '../lib/url-validator.js'

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888'

function isEnabled(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined) return defaultValue
  return /^(1|true|yes|on)$/i.test(raw)
}

const REWRITE_DEFAULT = isEnabled('WEB_SEARCH_REWRITE', true)
const RERANK_DEFAULT = isEnabled('WEB_SEARCH_RERANK', false)

interface SearchResult {
  title: string
  url: string
  snippet: string
  content?: string
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSearXNGHtml(html: string, numResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const articlePattern = /<article\b[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi

  for (const articleMatch of html.matchAll(articlePattern)) {
    const article = articleMatch[1]
    const titleMatch = article.match(/<h3>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i)
    if (!titleMatch) continue

    const snippetMatch = article.match(/<p\s+class="content"[^>]*>([\s\S]*?)<\/p>/i)
    const title = htmlToText(titleMatch[2])
    const url = decodeHtml(titleMatch[1])
    const snippet = snippetMatch ? htmlToText(snippetMatch[1]) : ''

    if (title && url) {
      results.push({ title, url, snippet })
    }
    if (results.length >= numResults) break
  }

  return results
}

async function fetchPageContent(url: string, maxLength = 15000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    // Result URLs are untrusted (LLM/search-provided) and may redirect to
    // internal hosts, so they go through SSRF-guarded fetch with manual
    // redirect handling.
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.7',
      },
    })
    if (!response.ok) return ''
    const text = await response.text()
    let content = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + ' [truncated]'
    }
    return content
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

async function searchSearXNG(query: string, numResults: number): Promise<SearchResult[]> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    if (response.status === 403) {
      return searchSearXNGHtml(query, numResults)
    }
    throw new Error(`SearXNG search failed: HTTP ${response.status}`)
  }
  const data = (await response.json()) as { results: { title: string; url: string; content?: string }[] }
  return (data.results || []).slice(0, numResults).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }))
}

async function searchSearXNGHtml(query: string, numResults: number): Promise<SearchResult[]> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&categories=general`
  const response = await fetch(url, { headers: { Accept: 'text/html' } })
  if (!response.ok) {
    throw new Error(`SearXNG HTML search failed: HTTP ${response.status}`)
  }
  return parseSearXNGHtml(await response.text(), numResults)
}

export function createWebSearchTool(apiKey?: string) {
  return tool({
    description: 'Search the web using SearXNG (aggregates Google, Bing, DuckDuckGo and more). Returns search results with titles, URLs, snippets, and optionally fetched page content from the top results for comprehensive answers.',
    inputSchema: jsonSchema<{ query: string; numResults?: number; fetchContent?: boolean }>({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        numResults: { type: 'number', description: 'Number of results to return, max 10 (default 5)' },
        fetchContent: { type: 'boolean', description: 'Whether to fetch and include page content from top results (default true)' },
      },
      required: ['query'],
    }),
    execute: async ({ query, numResults = 5, fetchContent = true }) => {
      const maxResults = Math.min(numResults, 10)

      try {
        // 1. Optionally rewrite the user query into diverse variants. Always
        //    includes the original query first as a safety net.
        const useRewrite = REWRITE_DEFAULT && Boolean(apiKey)
        const queries = useRewrite ? await rewriteQuery(apiKey!, query) : [query]

        // 2. Run all variant searches in parallel; failures yield empty lists
        //    so one bad variant doesn't sink the whole search.
        const perQuery = await Promise.all(
          queries.map((q) =>
            searchSearXNG(q, maxResults).catch((err) => {
              console.warn(`[web-search] variant "${q}" failed:`, err instanceof Error ? err.message : err)
              return [] as SearchResult[]
            }),
          ),
        )

        // 3. Reciprocal Rank Fusion across variants.
        const fused = queries.length > 1 ? fuseResults(perQuery) : perQuery[0] ?? []

        // 4. Optional LLM rerank on a slightly larger candidate pool.
        const useRerank = RERANK_DEFAULT && Boolean(apiKey) && fused.length > 1
        const candidatePoolSize = Math.max(maxResults * 2, 10)
        const candidates = fused.slice(0, candidatePoolSize)
        const final = useRerank
          ? await rerankResults(apiKey!, query, candidates, maxResults)
          : fused.slice(0, maxResults)

        // 5. Fetch actual page content from top 3 for richer answers.
        if (fetchContent && final.length > 0) {
          const fetchLimit = Math.min(final.length, 3)
          const contentPromises = final.slice(0, fetchLimit).map(async (result) => {
            result.content = await fetchPageContent(result.url)
          })
          await Promise.allSettled(contentPromises)
        }

        return {
          query,
          results: final,
          totalResults: final.length,
          ...(useRewrite && queries.length > 1 ? { rewrittenQueries: queries } : {}),
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Search failed' }
      }
    },
  })
}

/** Backwards-compatible export: tool instance without LLM augmentation. */
export const webSearchTool = createWebSearchTool()
