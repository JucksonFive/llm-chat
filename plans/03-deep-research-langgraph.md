# Plääni 03 — Deep Research -agentin refaktorointi LangGraphiin

## Tavoite

Korvaa [deep-research.ts](../server/tools/deep-research.ts) nykyinen kiinteä lineaarinen putki LangGraph-tilakoneella joka tukee silmukoita, ehtoja ja refleksiota.

## Nykytila

Nykyinen `deep-research.ts`:
1. Ottaa topic + 3 kovakoodattua query-varianttia.
2. Ajaa SearXNG-haun jokaiselle.
3. Dedupaa URL:t, ottaa top-N.
4. Fetchaa sivut rinnakkain.
5. Palauttaa raa'an tekstin LLM:lle.

Puutteita:
- **Ei evaluointia** — jos lähteet ovat huonoja, ei haeta uudestaan.
- **Ei suunnitteluvaihetta** — LLM ei osallistu queryjen generointiin älykkäästi (vain string-template).
- **Ei synteesiä server-puolella** — LLM saa 30k merkkiä dataa × N lähde.
- **Ei keskeytettävyyttä/resume** — jos verkko pätkii, kaikki menee.

## Lopputila

LangGraph-tilakone:

```
[start] → plan_queries → search → fetch → evaluate
                                            ↓
                                     enough? ──no──→ refine_queries ──┐
                                            ↓ yes                      │
                                       synthesize                      │
                                            ↓                    (loop max 3)
                                          [end]
```

### Solmut

| Solmu | Tehtävä |
|---|---|
| `plan_queries` | LLM-kutsu: generoi 4–6 laadukasta hakukyselyä eri näkökulmista. |
| `search` | Aja SearXNG-haut, dedup URL:t. |
| `fetch` | Fetchaa sivut (Cheerio + HtmlToText, ks. plääni 09). |
| `evaluate` | LLM arvioi: onko dataa riittävästi vastaamaan topiciin? Palauttaa `{enough: bool, missing: string[]}`. |
| `refine_queries` | LLM generoi uusia queryjä `missing`-listan perusteella. |
| `synthesize` | LLM tiivistää lähteet jäsenneltyyn vastaukseen lähteineen. |

### Tila

```ts
type ResearchState = {
  topic: string
  queries: string[]
  results: SearchResult[]
  sources: Source[]
  evaluation?: { enough: boolean; missing: string[] }
  iteration: number   // max 3
  synthesis?: string
}
```

## Tekniset muutokset

### 1. Riippuvuudet
```
pnpm add @langchain/langgraph @langchain/openai @langchain/anthropic
```

### 2. Uudet tiedostot

**`server/tools/deep-research/graph.ts`**
- Rakentaa `StateGraph<ResearchState>`.
- Ehdolliset siirrot: `evaluate` → `synthesize` tai `refine_queries` perustuen `evaluation.enough`iin ja `iteration < 3`.

**`server/tools/deep-research/nodes/`**
- `plan.ts`, `search.ts`, `fetch.ts`, `evaluate.ts`, `refine.ts`, `synthesize.ts` — kukin export-funktio `(state) => Partial<state>`.

**`server/tools/deep-research.ts`** (päivitä olemassa olevaa)
- Tool-määritelmä säilyy samana (API-yhteensopivuus), sisäisesti kutsuu graafin `invoke()`.
- Streamaa välivaiheita tool-progress-eventeinä (vaatii AI SDK:n custom-event-tuen — jos ei, palauta vain lopullinen tulos).

### 3. LLM-provideri graafin sisällä

Tarve: tarvitsemme LLM-clientin server-puolella suunnittelu/arviointi/synteesi-vaiheisiin.
- Käytä `ChatOpenAI` / `ChatAnthropic` (LangChain) **tai** kääri AI SDK:n `generateText` LangGraph-solmun sisään.
- Suositus: LangChainin chat-modelli — parempi integraatio LangGraphiin. Malli ja API-avain välitetään tool-kontekstissa.

**Huom**: tool-kontekstissa ei ole nyt API-avainta suoraan. Lisää `apiKey` ja `providerId` parametreina tool-definitioniin (katso [server/tools/index.ts](../server/tools/index.ts) `getBuiltInTools`-signature).

### 4. LangSmith tracing (valinnainen mutta suositeltu)

LangGraph-grafi tracetaan automaattisesti jos `LANGCHAIN_TRACING_V2=true` ja `LANGCHAIN_API_KEY` ovat asetettu (ks. plääni 06).

## Riskit

- **Kustannus kasvaa** — 3 ekstra LLM-kutsua per deep-research. Dokumentoi tämä.
- **Latenssi kasvaa** — plan + evaluate + synthesize vievät aikaa. Lievennä: rinnakkaista `fetch` aggressiivisesti, käytä haiku/nano-mallia evaluoinnissa.
- **Silmukkaraja** — kova 3-iteraation raja ettei mene loputtomaksi.

## Testaus

- Vertaa vanhaan: sama topic molemmilla, arvioi vastauksen laatu manuaalisesti.
- Varmista että `iteration` cap pysäyttää ikuisen silmukan.

## Työmäärä-arvio

Suurin pläänissä 1–5. Laskisin ~1 päivä koodausta + testaus. Kannattaa tehdä vasta kun plääni 06 (tracing) on paikoillaan, niin debuggaaminen on helpompaa.
