# Plan 07 — Automatic Memory Summarization

## Goal

When agent's long-term memories exceed a limit (e.g. 100 count or 50k chars), old ones are summarized by LLM into a single "summary" memory. Keeps memory useful indefinitely without prompt bloat.

## Current State

- [memory-store.ts](../src/stores/memory-store.ts): no upper limit for long-term memories.
- `getMemoryPrompt` appends all (after plan 01 only relevant top-K, but storage still grows unbounded).

## End State

Background job (cron or trigger after addMemory):
1. Count agent's long-term memories.
2. If > 100: take 20 oldest.
3. Send to LLM prompt: *"Summarize these memories into 1–3 concise key facts, preserving important details"*.
4. Create new `type='summary'` memory (or tag in metadata).
5. Delete the original 20.

## Prerequisites

- **Plan 01** — so semantic search also works on summaries.
- Recommendation: **Plan 06** — so summarization quality can be monitored.

## Technical Changes

### 1. DB Schema
Expand [server/db.ts](../server/db.ts) `memories` table `type` CHECK clause:
```sql
type TEXT NOT NULL DEFAULT 'long' CHECK(type IN ('short', 'long', 'summary'))
```
Bump `SCHEMA_VERSION`.

### 2. New Module

**`server/memory/summarizer.ts`**
```ts
async function summarizeMemories(
  memories: Memory[],
  apiKey: string,
): Promise<string[]>   // 1–3 summary strings
```

Uses `ChatOpenAI` + `withStructuredOutput(z.object({ summaries: z.array(z.string()).max(3) }))`.

Prompt:
```
You are compressing a user's long-term memory. The following {N} memories were recorded
over time. Merge them into 1–3 concise statements that preserve:
- Key facts about the user
- Preferences
- Specific details (names, dates, numbers)
Drop redundancy. Each summary should be standalone and useful out of context.

Memories:
- {content1}
- {content2}
...
```

### 3. Trigger

**Option A — eager (right after add)**
[server/db-routes.ts](../server/db-routes.ts): `POST /api/db/memories` handler → if `count > threshold`, call `summarizeMemories` async (don't block response).

**Option B — cron** (recommended)
`server/memory/maintenance.ts`: `setInterval(runMaintenance, 1h)`. Iterate agents, summarize overflowing.

**Option C — manual button**
UI in agent settings: "Compress memories" button. Easiest to start.

**Recommendation**: start with C, add B later.

### 4. UI

[src/components/memory/](../src/components/memory/): mark summary memories distinctively (icon, "auto-summarized N memories on 23.4.2026" tooltip). Retain edit/delete.

### 5. Vector Sync

When 20 memories deleted and 1–3 summary memories created → vectors auto-update through `POST /api/db/memories` route (plan 01).

## Edge Cases

- LLM call fails: don't delete original memories. Retry next maintenance cycle.
- User edits summary memory → ok, now "manual".
- Threshold tuning: start with 100, monitor summarization quality from LangSmith (plan 06).

## Testing

- Create 150 memories, trigger maintenance, verify end state sensible.
- Semantic search on summaries: verify summarized info still found by queries (plan 01).

## Effort Estimate

Small–medium if plan 01 is ready.

