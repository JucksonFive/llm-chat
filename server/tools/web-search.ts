import { tool, jsonSchema } from 'ai'

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888'

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
    const response = await fetch(url, {
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

export const webSearchTool = tool({
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
      const results = await searchSearXNG(query, maxResults)

      // Fetch actual page content from top 3 results for richer answers
      if (fetchContent && results.length > 0) {
        const fetchLimit = Math.min(results.length, 3)
        const contentPromises = results.slice(0, fetchLimit).map(async (result) => {
          result.content = await fetchPageContent(result.url)
        })
        await Promise.allSettled(contentPromises)
      }

      return { query, results, totalResults: results.length }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Search failed' }
    }
  },
})
