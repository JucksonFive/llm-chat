# Plääni 09 — Älykkäämpi web-sisällön parsinta

## Tavoite

Korvaa [web-fetch.ts](../server/tools/web-fetch.ts) ja [deep-research.ts](../server/tools/deep-research.ts) regex-pohjainen HTML-strippaus kunnollisella DOM-parsingilla. Tuloksena puhtaampi teksti, boilerplate-filtteröinti (nav, footer, mainokset), ja parempi struktuurin säilytys (otsikot, listat).

## Nykytila

[deep-research.ts](../server/tools/deep-research.ts#L30-L70) `fetchPageContent`:
```ts
text.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    ...
    .replace(/\s+/g, ' ')
```

Ongelmat:
- Nav/footer/sidebar/cookie-bannerit jäävät mukaan → kohinaa.
- Otsikot, listat, linkit menetetään → LLM näkee massan tekstiä.
- Table/code-lohkot rikkoutuvat.

## Lopputila

Cheerio-pohjainen extraktori joka:
1. Poistaa tunnetut boilerplate-selektorit (`nav, footer, aside, [role=banner], .ad, .cookie-*`).
2. Yrittää löytää päänarttikkelin (`article, main, [role=main]`).
3. Muuntaa semanttiseksi Markdowniksi (`# Heading`, `- list`, `[text](url)`).

Vaihtoehtona @mozilla/readability (sama algoritmi kuin Firefoxin Reader Modessa) — erityisen hyvä artikkelisisältöön.

## Tekniset muutokset

### 1. Riippuvuudet
```
pnpm add @langchain/community cheerio @mozilla/readability jsdom
```
(LangChainilla on `CheerioWebBaseLoader` joka kapseloi tämän, mutta suora Cheerio + Readability on ohuempi.)

### 2. Uusi moduli

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

`htmlToMarkdown`: käytä `turndown` ( `pnpm add turndown`) tai kevyt oma implementaatio (h1-h6, p, ul/ol, a, code, pre).

### 3. Käyttö

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

**[server/tools/deep-research.ts](../server/tools/deep-research.ts)**: korvaa `fetchPageContent` käyttämään `extractArticle`.

### 4. Turvallisuus

- Timeout 10s per fetch (pysyy).
- User-Agent säilyy.
- Max content length säilyy.
- **Lisää SSRF-suoja**: estä `localhost`, `127.0.0.1`, `169.254.*`, `10.*`, `192.168.*` ellei explicitly salli. Tärkeä kun sovellus pyörii Electronissa käyttäjän koneella.

### 5. Electron-yhteensopivuus

`jsdom` on iso riippuvuus (~5MB). Tarkista että Electron-bundle ei kasva kohtuuttomasti. Vaihtoehto: pelkkä Cheerio ilman Readabilityä jos koko kasvaa liikaa.

## Testaus

- 10 eri sivustoa (blog, news, SPA, wiki, docs), vertaa ennen/jälkeen-tekstin laatua.
- Varmista SSRF-suoja: yritä fetchata `http://localhost:3001/api/db/agents` → pitää estyä.

## Työmäärä-arvio

Pieni. Pääasia on extractor-modulin testaus eri sivuilla.
