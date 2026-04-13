import { tool, jsonSchema } from 'ai'

export const webFetchTool = tool({
  description: 'Fetch content from a URL. Returns the text content of the page with HTML tags stripped.',
  parameters: jsonSchema({
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      maxLength: { type: 'number', description: 'Maximum number of characters to return (default 50000)' },
    },
    required: ['url'],
  }),
  execute: async ({ url, maxLength = 50000 }: { url: string; maxLength?: number }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LLM-Chat/1.0 (Desktop App)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        },
      })

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const text = await response.text()

      let content: string
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        content = text
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
      } else {
        content = text
      }

      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n\n[Truncated]'
      }

      return { url, contentType, length: content.length, content }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { error: 'Request timed out after 15 seconds' }
      }
      return { error: err instanceof Error ? err.message : 'Failed to fetch URL' }
    } finally {
      clearTimeout(timeout)
    }
  },
})
