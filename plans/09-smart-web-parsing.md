# Plan 09 — Smart Web Content Parsing

## Goal

Replace [web-fetch.ts](../server/tools/web-fetch.ts) and [deep-research.ts](../server/tools/deep-research.ts) regex-based HTML stripping with proper DOM parsing. Result: cleaner text, boilerplate filtering (nav, footer, ads), and better structure preservation (headings, lists).

## Current State

[deep-research.ts](../server/tools/deep-research.ts#L30-L70) `fetchPageContent`:
```ts
text.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    ...
    .replace(/\s+/g, ' ')
```

Problems:
- Nav/footer/sidebar/cookie banners remain → noise.
- Headings, lists, links are lost → LLM sees a mass of text.
- Table/code blocks break.

## End State

Cheerio-based extractor that:
1. Removes known boilerplate selectors (`nav, footer, aside, [role=banner], .ad, .cookie-*`).
2. Attempts to find the main article (`article, main, [role=main]`).
3. Converts to semantic Markdown (`# Heading`, `- list`, `[text](url)`).

Alternative @mozilla/readability (same algorithm as Firefox's Reader Mode) — especially good for article content.

## Technical Changes

### 1. Dependencies
```
pnpm add @langchain/community cheerio @mozilla/readability jsdom
```
(LangChain has `CheerioWebBaseLoader` which wraps this, but direct Cheerio + Readability is lighter.)

### 2. New Module

**`server/web/extractor.ts`**
```ts
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export async function extractArticle(html: string, url: string): Promise<{
  title: string
  markdown: string
  byline?: string
  excerpt?: string
}> {
  // Try Readability first (best for articles)
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  if (article?.content) {
    return {
      title: article.title ?? '',
      markdown: htmlToMarkdown(article.content),
      byline: article.byline ?? undefined,
      excerpt: article.excerpt ?? undefined,
    }
  }

  // Fallback: Cheerio-based
  const $ = cheerio.load(html)
  $('script, style, nav, footer, aside, [role=banner], [role=navigation], .ad, .advertisement, .cookie-banner').remove()
  const main = $('article, main, [role=main]').first()
  const target = main.length ? main : $('body')
  return {
    title: $('title').text().trim(),
    markdown: htmlToMarkdown(target.html() ?? ''),
  }
}
```

`htmlToMarkdown`: use `turndown` ( `pnpm add turndown`) or a lightweight custom implementation (h1-h6, p, ul/ol, a, code, pre).

### 3. Usage

**[server/tools/web-fetch.ts](../server/tools/web-fetch.ts)**
```ts
const html = await response.text()
const article = await extractArticle(html, url)
return {
  title: article.title,
  url,
  content: article.markdown.slice(0, maxLength),
}
```

**[server/tools/deep-research.ts](../server/tools/deep-research.ts)**: replace `fetchPageContent` to use `extractArticle`.

### 4. Security

- Timeout 10s per fetch (retained).
- User-Agent retained.
- Max content length retained.
- **Add SSRF protection**: block `localhost`, `127.0.0.1`, `169.254.*`, `10.*`, `192.168.*` unless explicitly allowed. Important when the application runs in Electron on the user's machine.

### 5. Electron Compatibility

`jsdom` is a large dependency (~5MB). Check that the Electron bundle doesn't grow excessively. Alternative: Cheerio only without Readability if size grows too much.

## Testing

- 10 different websites (blog, news, SPA, wiki, docs), compare text quality before/after.
- Verify SSRF protection: attempt to fetch `http://localhost:3001/api/db/agents` → must be blocked.

## Effort Estimate

Small. The main focus is testing the extractor module on different websites.
