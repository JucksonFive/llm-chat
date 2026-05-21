const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888'

export interface RawSearchResult {
  title: string
  url: string
  snippet: string
}

export async function searchSearXNG(query: string, numResults: number): Promise<RawSearchResult[]> {
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

export async function fetchPageContent(url: string, maxLength = 30_000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

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
