# Plääni 04 — Web-haun query rewriting + reranking

## Tavoite

Paranna [web-search.ts](../server/tools/web-search.ts):n osumatarkkuutta: LLM kirjoittaa queryn uudelleen useaksi variantiksi, tulokset fuusioidaan ja rerankataan.

## Nykytila

[web-search.ts](../server/tools/web-search.ts) syöttää käyttäjän queryn suoraan SearXNG:lle ja palauttaa top-N tulosta raakajärjestyksessä. Jos käyttäjän kysymys on huonosti muotoiltu, tulokset ovat huonoja.

## Lopputila

Pipeline:
```
query → [LLM rewriter] → [3–4 variant queryä]
      → [rinnakkaiset SearXNG-haut] → [fuusio + dedup]
      → [reranker] → [top-K]
```

Toteutetaan kahtena vaiheena:
- **Vaihe A (pieni)**: `MultiQueryRetriever` query rewritingiin.
- **Vaihe B (suurempi)**: cross-encoder rerank (CohereRerank tai local).

## Tekniset muutokset

### Vaihe A — Multi-query rewriting

**Riippuvuudet**
```
pnpm add @langchain/core @langchain/openai
```

**Muutos**: [web-search.ts](../server/tools/web-search.ts)
- Ennen SearXNG-kutsua: kutsu `ChatOpenAI` pienellä mallilla (`gpt-4.1-nano` / `haiku`) prompt:
  > "Generate 3 diverse search queries that would help answer this question. Return JSON array of strings. Question: {query}"
- Käytä `withStructuredOutput(z.object({ queries: z.array(z.string()) }))`.
- Aja SearXNG rinnakkain kaikille. Fuusioi tulokset **Reciprocal Rank Fusion** -algoritmilla:
  ```
  score(url) = Σ 1/(k + rank_i(url))   // k=60
  ```
- Palauta top-N fuusion mukaan.

### Vaihe B — Reranking

**Vaihtoehto 1 — Cohere Rerank (helppo, maksullinen)**
```
pnpm add @langchain/cohere
```
- `CohereRerank` saa API-avaimen env-muuttujasta.
- Ota vaihe A:n top-20 → rerank → top-5.

**Vaihtoehto 2 — Local cross-encoder (ilmainen, raskas)**
- `@xenova/transformers` + `Xenova/ms-marco-MiniLM-L-6-v2`.
- Toimii CPU:lla mutta lisää n. 500MB malliin ja 2–5s latenssia.
- Ei sovi Electron-bundleen helposti.

**Vaihtoehto 3 — LLM-as-reranker (oletus)**
- Ei uutta riippuvuutta. Käytä pikku-LLM:ää:
  > "Rank these results by relevance to: {query}. Return JSON array of IDs in order."
- Halvempi operatiivisesti, lisää 1 LLM-kutsu.

**Suositus**: aloita LLM-rerankerilla (vaihtoehto 3), tee siitä opt-in `builtInToolIds`-optioksi myöhemmin.

### 3. Konfigurointi

Lisää ympäristömuuttujat:
```
WEB_SEARCH_REWRITE=true
WEB_SEARCH_RERANK=false          # opt-in
```

Tai UI-toggle [src/components/settings/](../src/components/settings/).

### 4. Fallback

Jos rewriter-LLM epäonnistuu (ei API-avainta, rate-limit): käytä pelkkää alkuperäistä queryä. Ei saa rikkoa peruskäyttöä.

## Testaus

- Evaluointisetti: 20 tunnettua kysymystä + odotettu URL top-5:ssä.
- Mittaa hit-rate ennen/jälkeen.

## Työmäärä-arvio

Vaihe A: pieni. Vaihe B LLM-rerankerilla: keskisuuri. Yhteensä hallittavissa yhdellä istunnolla.
