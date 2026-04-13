import { tool, jsonSchema } from 'ai'

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

async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'LLM-Chat/1.0 (Desktop App)',
      Accept: 'text/html',
    },
  })

  if (!response.ok) return []

  const html = await response.text()
  const results: SearchResult[] = []

  const resultBlocks = html.split('class="result__body"')
  for (let i = 1; i < resultBlocks.length && results.length < numResults; i++) {
    const block = resultBlocks[i]

    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    const urlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)<\/a>/)
    let url = urlMatch ? urlMatch[1].replace(/<[^>]+>/g, '').trim() : ''
    if (url && !url.startsWith('http')) url = 'https://' + url

    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\//)
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    if (title && url) results.push({ title, url, snippet })
  }

  return results
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
  parameters: jsonSchema({
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
  }: {
    topic: string
    searchQueries?: string[]
    maxSources?: number
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
        const results = await searchDuckDuckGo(query, 5)
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
