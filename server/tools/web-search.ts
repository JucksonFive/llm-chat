import { tool, jsonSchema } from 'ai'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export const webSearchTool = tool({
  description: 'Search the web using DuckDuckGo. Returns a list of search results with titles, URLs, and snippets.',
  inputSchema: jsonSchema<{ query: string; numResults?: number }>({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      numResults: { type: 'number', description: 'Number of results to return, max 10 (default 5)' },
    },
    required: ['query'],
  }),
  execute: async ({ query, numResults = 5 }) => {
    const maxResults = Math.min(numResults, 10)

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'LLM-Chat/1.0 (Desktop App)',
          Accept: 'text/html',
        },
      })

      if (!response.ok) {
        return { error: `Search failed: HTTP ${response.status}` }
      }

      const html = await response.text()
      const results: SearchResult[] = []

      const resultBlocks = html.split('class="result__body"')
      for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
        const block = resultBlocks[i]

        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
          : ''

        const urlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)<\/a>/)
        let url = urlMatch
          ? urlMatch[1].replace(/<[^>]+>/g, '').trim()
          : ''
        if (url && !url.startsWith('http')) {
          url = 'https://' + url
        }

        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\//)
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
          : ''

        if (title && url) {
          results.push({ title, url, snippet })
        }
      }

      return { query, results, totalResults: results.length }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Search failed' }
    }
  },
})
