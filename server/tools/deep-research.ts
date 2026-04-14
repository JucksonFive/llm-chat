import { tool, jsonSchema } from 'ai'

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface Source {
  title: string
  url: string
  content: string
}

async function searchSearXNG(query: string, numResults: number): Promise<SearchResult[]> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return []
  const data = (await response.json()) as { results: { title: string; url: string; content?: string }[] }
  return (data.results || []).slice(0, numResults).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
  }))
}

async function fetchPageContent(url: string, maxLength = 30000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LLM-Chat/1.0 (Desktop App)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.7',
      },
    })

    if (!response.ok) return ''

    const text = await response.text()
    let content = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
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

export const deepResearchTool = tool({
  description:
    'Perform deep research on a topic by executing multiple web searches with different angles, fetching and reading the most relevant pages, and compiling findings. Use this for comprehensive research that requires gathering information from many sources.',
  inputSchema: jsonSchema<{ topic: string; searchQueries?: string[]; maxSources?: number }>({
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The research topic or question' },
      searchQueries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific search queries to use. If not provided, will auto-generate queries from the topic.',
      },
      maxSources: { type: 'number', description: 'Maximum number of sources to fetch and read (default 8, max 15)' },
    },
    required: ['topic'],
  }),
  execute: async ({
    topic,
    searchQueries,
    maxSources = 8,
  }) => {
    const limit = Math.min(maxSources, 15)

    try {
      const queries = searchQueries && searchQueries.length > 0
        ? searchQueries
        : [
            topic,
            `${topic} overview explanation`,
            `${topic} latest news 2026`,
          ]

      const allResults: SearchResult[] = []
      const seenUrls = new Set<string>()

      for (const query of queries) {
        const results = await searchSearXNG(query, 5)
        for (const result of results) {
          if (!seenUrls.has(result.url)) {
            seenUrls.add(result.url)
            allResults.push(result)
          }
        }
      }

      const topResults = allResults.slice(0, limit)

      const sources: Source[] = []
      const fetchPromises = topResults.map(async (result) => {
        const content = await fetchPageContent(result.url)
        if (content.length > 100) {
          sources.push({
            title: result.title,
            url: result.url,
            content,
          })
        }
      })

      await Promise.allSettled(fetchPromises)

      const compiledResearch = sources
        .map(
          (s, i) =>
            `--- Source ${i + 1}: ${s.title} ---\nURL: ${s.url}\n\n${s.content}\n`
        )
        .join('\n\n')

      return {
        topic,
        queriesUsed: queries,
        sourcesFound: allResults.length,
        sourcesRead: sources.length,
        sources: sources.map((s) => ({ title: s.title, url: s.url })),
        research: compiledResearch,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Deep research failed' }
    }
  },
})
