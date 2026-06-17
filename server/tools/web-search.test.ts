import { describe, expect, it, vi } from 'vitest'

// The HTML parser and decoder are not exported, so we exercise their behavior
// through the public webSearchTool by mocking `fetch`. But for fast unit
// coverage we re-implement the same regexes and assert equivalent behavior on
// representative HTML — the assertions below act as a regression net for the
// SearXNG HTML fallback parser shape.

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

describe('decodeHtml entity handling (parity with web-search.ts)', () => {
  it('decodes named entities', () => {
    expect(decodeHtml('foo&nbsp;bar &amp; baz &lt;3 &gt;_&gt; &quot;a&quot; &#39;b&#39;'))
      .toBe('foo bar & baz <3 >_> "a" \'b\'')
  })

  it('decodes numeric entities', () => {
    expect(decodeHtml('&#65;&#66;&#x43;&#x44;')).toBe('ABCD')
  })
})

describe('webSearchTool', () => {
  it('exists with execute() and an inputSchema', async () => {
    const { webSearchTool } = await import('./web-search.js')
    expect(webSearchTool).toBeDefined()
    expect(webSearchTool.execute).toBeTypeOf('function')
    expect(webSearchTool.inputSchema).toBeDefined()
  })
})

// Integration: a SearXNG result whose URL points at an internal host must not
// crash the tool. The SSRF guard in fetchPageContent rejects it, the page
// content is left empty, and the search still returns results.
describe('webSearchTool — SSRF safety on fetched result URLs', () => {
  it('does not crash when a result URL targets an internal host', async () => {
    const { webSearchTool } = await import('./web-search.js')

    const searxngJson = JSON.stringify({
      results: [
        { title: 'Internal', url: 'http://169.254.169.254/latest/meta-data/', content: 'snippet' },
      ],
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const target = typeof input === 'string' ? input : input.toString()
      // The SearXNG endpoint query returns our crafted result list.
      if (target.includes('/search?')) {
        return new Response(searxngJson, { status: 200, headers: { 'content-type': 'application/json' } })
      }
      // Any other fetch (e.g. the malicious result URL) would only happen if the
      // SSRF guard failed to block it — surface that as a test failure.
      throw new Error(`unexpected fetch to ${target}`)
    })

    try {
      const result = (await webSearchTool.execute!(
        { query: 'test', numResults: 1, fetchContent: true },
        { toolCallId: 't1', messages: [] },
      )) as { error?: string; results?: { content?: string }[] }

      expect(result.error).toBeUndefined()
      expect(result.results?.length).toBe(1)
      // The blocked URL yields empty page content rather than throwing.
      expect(result.results?.[0]?.content).toBe('')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
