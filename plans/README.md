# LangChain-integraatio — toteutussuunnitelmat

Tämä kansio sisältää yksittäiset, toisistaan riippumattomat toteutussuunnitelmat LangChainin / LangGraphin / LangSmithin integroimiseksi projektiin. Jokainen plääni on itsenäinen ja toteutettavissa omana branch/PR:nään.

## Yleiset periaatteet

- **AI SDK jää ydinvirraksi** — LangChainia käytetään vain siellä missä se tuo selkeää lisäarvoa (RAG, orkestraatio, evaluointi, tracing).
- **MCP-työkaluina missä mahdollista** — uudet RAG-toiminnot paketoidaan built-in-työkaluiksi `server/tools/` alle, jotta ne näkyvät LLM:lle työkaluina.
- **Vektorikanta**: aloitetaan `sqlite-vec`-pohjalla (sama [server/db.ts](../server/db.ts) sql.js-kanta, vec-laajennus) tai `@langchain/community/vectorstores/memory`lla MVP:ssä. Tuotantoon `pgvector` / `Chroma` jos skaalaa tarvitaan.
- **Embedding-malli**: `text-embedding-3-small` (OpenAI) oletuksena, konfiguroitavissa. API-avain uudelleenkäytetään käyttäjän OpenAI-keystä ([api-key-store.ts](../src/stores/api-key-store.ts)).

## Toteutusjärjestys (suositus)

Suurin arvo edellä, yhteinen infra ensin:

**Status: ✅ valmis · ⏳ kesken · ⬜ ei aloitettu**

1. ✅ **[01-semantic-memory-search.md](01-semantic-memory-search.md)** — pystyttää embedding + vektorikanta-infran.
2. ✅ **[02-document-rag-tool.md](02-document-rag-tool.md)** — käyttää samaa infraa, PDF/tiedosto-RAG.
3. ⬜ **[06-langsmith-tracing.md](06-langsmith-tracing.md)** — observability ennen isoja agenttimuutoksia.
4. ✅ **[04-web-search-rerank.md](04-web-search-rerank.md)** — nopea laatuparannus web-hakuun.
5. ⬜ **[09-smart-web-parsing.md](09-smart-web-parsing.md)** — parempi HTML-parsinta, pieni muutos.
6. ⬜ **[03-deep-research-langgraph.md](03-deep-research-langgraph.md)** — deep-research refaktorointi (nykyinen `server/tools/deep-research.ts` käyttää AI SDK:ta, ei vielä LangGraphia).
7. ⬜ **[07-memory-summarization.md](07-memory-summarization.md)** — rakentaa #1 päälle.
8. ⬜ **[08-semantic-history-trim.md](08-semantic-history-trim.md)** — rakentaa #1 päälle.
9. ⬜ **[05-structured-agent-output.md](05-structured-agent-output.md)** — UX-feature.
10. ⬜ **[10-evaluation-framework.md](10-evaluation-framework.md)** — kun agenttipintaa kertyy.

> Päivitetty 2026-05-21. Tarkistettu repon tilan perusteella:
> - **Plan 01** valmis — `server/rag/embeddings.ts`, `server/rag/vector-store.ts`, `server/rag/memory-index.ts` olemassa.
> - **Plan 02** valmis — `server/rag/document-index.ts`, `server/rag/text-splitter.ts`, työkalut `server/tools/document-indexer.ts` + `document-search.ts`.
> - **Plan 04** valmis — `server/tools/web-search-rewrite.ts` (multi-query rewrite + RRF fusion + valinnainen LLM-rerank).
> - Pläänit 03, 05–10 odottavat vielä toteutusta.

## Yhteinen infra (jaettu pläänien 01, 02, 07, 08 välillä)

Ensimmäinen plääni luo nämä modulit:

- `server/rag/embeddings.ts` — embedding-client wrapper.
- `server/rag/vector-store.ts` — vektorikanta-abstraktio (`upsert`, `search`, `delete`).
- `server/rag/chunker.ts` — tekstin paloittelu.
- DB-skeema: `vectors`-taulu (id, source_type, source_id, agent_id, content, embedding BLOB, metadata JSON).

Myöhemmät pläänit viittaavat näihin moduleihin.

## Riippuvuudet (uudet)

```
@langchain/core
@langchain/openai
@langchain/community     # vektorikannat, loaderit
@langchain/langgraph     # vain plääni 03
langsmith                # vain plääni 06
```

Ei korvata AI SDK:ta — asennetaan rinnakkain.
