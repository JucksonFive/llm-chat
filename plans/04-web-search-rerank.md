# Plan 04 — Web Search Query Rewriting + Reranking

## Goal

Improve precision in [web-search.ts](../server/tools/web-search.ts): LLM rewrites query into multiple variants, results fused and reranked.

## Current State

[web-search.ts](../server/tools/web-search.ts) passes user query directly to SearXNG and returns top-N results in raw order. If user question is poorly phrased, results are poor.

## End State

Pipeline:
```
query → [LLM rewriter] → [3–4 variant queries]
      → [parallel SearXNG searches] → [fusion + dedup]
      → [reranker] → [top-K]
```

Implemented in two phases:
- **Phase A (small)**: `MultiQueryRetriever` for query rewriting.
- **Phase B (larger)**: cross-encoder rerank (CohereRerank or local).

## Technical Changes

### Phase A — Multi-query Rewriting

**Dependencies**
```
pnpm add @langchain/core @langchain/openai
```

**Change**: [web-search.ts](../server/tools/web-search.ts)
- Before SearXNG call: call `ChatOpenAI` with small model (`gpt-4.1-nano` / `haiku`) prompt:
  > "Generate 3 diverse search queries that would help answer this question. Return JSON array of strings. Question: {query}"
- Use `withStructuredOutput(z.object({ queries: z.array(z.string()) }))`.
- Run SearXNG in parallel for all. Fuse results using **Reciprocal Rank Fusion** algorithm:
  ```
  score(url) = Σ 1/(k + rank_i(url))   // k=60
  ```
- Return top-N by fusion score.

### Phase B — Reranking

**Option 1 — Cohere Rerank (easy, paid)**
```
pnpm add @langchain/cohere
```
- `CohereRerank` gets API key from env var.
- Take phase A's top-20 → rerank → top-5.

**Option 2 — Local cross-encoder (free, heavy)**
- `@xenova/transformers` + `Xenova/ms-marco-MiniLM-L-6-v2`.
- Works on CPU but adds ~500MB to bundle and 2–5s latency.
- Not ideal for Electron bundle.

**Option 3 — LLM-as-reranker (default)**
- No new dependency. Use small LLM:
  > "Rank these results by relevance to: {query}. Return JSON array of IDs in order."
- Cheaper operationally, adds 1 LLM call.

**Recommendation**: Start with LLM-reranker (option 3), make it opt-in `builtInToolIds` option later.

### 3. Configuration

Add environment variables:
```
WEB_SEARCH_REWRITE=true
WEB_SEARCH_RERANK=false          # opt-in
```

Or UI toggle in [src/components/settings/](../src/components/settings/).

### 4. Fallback

If rewriter LLM fails (no API key, rate limit): use only original query. Must not break basic usage.

## Testing

- Evaluation set: 20 known questions + expected URL in top-5.
- Measure hit-rate before/after.

## Effort Estimate

Phase A: small. Phase B with LLM-reranker: medium. Total doable in one session.

