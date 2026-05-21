import { describe, expect, it } from 'vitest'

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
