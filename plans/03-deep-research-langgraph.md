# Plan 03 — Deep Research Agent Refactor to LangGraph

## Goal

Replace the current fixed linear pipeline in [deep-research.ts](../server/tools/deep-research.ts) with a LangGraph state machine that supports loops, conditionals, and reflection.

## Current State

Current `deep-research.ts`:
1. Takes topic + 3 hardcoded query variants.
2. Runs SearXNG search for each.
3. Deduplicates URLs, takes top-N.
4. Fetches pages in parallel.
5. Returns raw text to LLM.

Limitations:
- **No evaluation** — if sources are poor, doesn't refetch.
- **No planning phase** — LLM doesn't participate intelligently in query generation (just string templates).
- **No synthesis server-side** — LLM gets 30k chars of data × N sources.
- **No interruption/resume** — network glitch loses all progress.

## End State

LangGraph state machine:

```
[start] → plan_queries → search → fetch → evaluate
                                            ↓
                                     enough? ──no──→ refine_queries ──┐
                                            ↓ yes                      │
                                       synthesize                      │
                                            ↓                    (loop max 3)
                                          [end]
```

### Nodes

| Node | Task |
|---|---|
| `plan_queries` | LLM call: generate 4–6 quality search queries from different angles. |
| `search` | Run SearXNG searches, dedup URLs. |
| `fetch` | Fetch pages (Cheerio + HtmlToText, see plan 09). |
| `evaluate` | LLM evaluates: is there enough data to answer the topic? Returns `{enough: bool, missing: string[]}`. |
| `refine_queries` | LLM generates new queries based on `missing` list. |
| `synthesize` | LLM summarizes sources into structured response with citations. |

### State

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

## Technical Changes

### 1. Dependencies
```
pnpm add @langchain/langgraph @langchain/openai @langchain/anthropic
```

### 2. New Files

**`server/tools/deep-research/graph.ts`**
- Build `StateGraph<ResearchState>`.
- Conditional transitions: `evaluate` → `synthesize` or `refine_queries` based on `evaluation.enough` and `iteration < 3`.

**`server/tools/deep-research/nodes/`**
- `plan.ts`, `search.ts`, `fetch.ts`, `evaluate.ts`, `refine.ts`, `synthesize.ts` — each exports a function `(state) => Partial<state>`.

**`server/tools/deep-research.ts`** (update existing)
- Tool definition remains the same (API compatibility), internally calls graph `invoke()`.
- Stream intermediate steps as tool-progress events (requires AI SDK custom-event support — if not, return only final result).

### 3. LLM Provider Inside Graph

Need: LLM client on server-side for planning/evaluation/synthesis phases.
- Use `ChatOpenAI` / `ChatAnthropic` (LangChain) **or** wrap AI SDK `generateText` inside LangGraph node.
- Recommendation: LangChain chat model — better LangGraph integration. Model and API key passed in tool context.

**Note**: tool context doesn't currently have API key directly. Add `apiKey` and `providerId` as parameters to tool definition (see [server/tools/index.ts](../server/tools/index.ts) `getBuiltInTools` signature).

### 4. LangSmith Tracing (optional but recommended)

LangGraph graph is auto-traced if `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` are set (see plan 06).

## Risks

- **Cost increases** — 3 extra LLM calls per deep-research. Document this.
- **Latency increases** — plan + evaluate + synthesize take time. Mitigate: aggressively parallelize `fetch`, use haiku/nano model for evaluation.
- **Loop limit** — hard 3-iteration cap to prevent infinite loops.

## Testing

- Compare to old: same topic both ways, manually judge answer quality.
- Ensure `iteration` cap prevents infinite loops.

## Effort Estimate

Largest among plans 1–5. Estimate ~1 day coding + testing. Worth doing only after plan 06 (tracing) is in place for easier debugging.

