# Plan 01 — Semantic Memory Search (RAG for Memories)

## Goal

Replace the "append all memories to the prompt" logic in [memory-store.ts](../src/stores/memory-store.ts) `getMemoryPrompt` function with semantic search: retrieve only the top-K most relevant memories based on the user's latest message.

## Current State

- `MAX_SHORT_TERM = 10` hardcoded limit.
- `getMemoryPrompt(agentId)` appends ALL agent long-term and short-term memories to every prompt.
- Scales poorly: 200 memories × every message = large prompt and high cost.

## End State

- When building the prompt, call `getRelevantMemories(agentId, userMessage, k=5)`.
- Memories are still stored in the `memories` table, but embeddings are calculated and stored in the `vectors` table.
- `addMemory` / `updateMemory` / `deleteMemory` automatically sync vectors.

## Technical Changes

### 1. Dependencies
```
pnpm add @langchain/core @langchain/openai @langchain/community sqlite-vec
```

### 2. Shared RAG infrastructure (created in this plan)

**`server/rag/embeddings.ts`**
- Export `getEmbeddings(apiKey: string)` → returns an `OpenAIEmbeddings` instance (`text-embedding-3-small`, 1536 dim).
- Cache instances by API key.

**`server/rag/vector-store.ts`**
- `upsertVector(id, sourceType, sourceId, agentId, content, embedding, metadata)`
- `searchVectors(agentId, queryEmbedding, k, filter?)` → top-K by cosine similarity
- `deleteVector(id)` / `deleteBySource(sourceType, sourceId)`
- Implementation: `sqlite-vec` extension on top of sql.js **or** if that doesn't work with sql.js, use in-memory cosine calculation (memory amounts are small, works fine).

**`server/rag/chunker.ts`** (interface only — used in plan 02)
- Wrapper for `RecursiveCharacterTextSplitter`.

### 3. DB Schema
Add to [server/db.ts](../server/db.ts):
```sql
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,     -- 'memory' | 'document' | 'message'
  source_id TEXT NOT NULL,
  agent_id TEXT,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,       -- Float32Array bytes
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vectors_source ON vectors(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_vectors_agent ON vectors(agent_id);
```
Bump `SCHEMA_VERSION` → 7.

### 4. REST Endpoints
Add to [server/db-routes.ts](../server/db-routes.ts):
- `POST /api/rag/memories/search` — body `{ agentId, query, k, apiKey }` → `{ memories: Memory[] }`
- `POST /api/rag/memories/reindex` — body `{ agentId, apiKey }` → rebuilds vectors (for migration).

### 5. Backfill Existing Memories
When user opens the app for the first time after the new version:
- If `memories.length > 0` and `vectors where source_type='memory'` is empty → run reindex.
- Show progress toast.

### 6. Frontend Changes

**`src/stores/memory-store.ts`**
- Add `getRelevantMemories(agentId, query, k): Promise<Memory[]>` which calls `/api/rag/memories/search`.
- `addMemory` / `updateMemory` / `deleteMemory`: no API changes — server handles vector maintenance in `POST /api/db/memories` endpoint.

**Prompt building** (find where `getMemoryPrompt` is called, likely [chat-store.ts](../src/stores/chat-store.ts) or [use-chat-stream.ts](../src/hooks/use-chat-stream.ts)):
- Replace `getMemoryPrompt(agentId)` → `await getMemoryPromptRelevant(agentId, lastUserMessage, k=5)`.
- Fallback: if query is empty or API key is missing, fall back to old behavior (all memories).

### 7. Server-side Memories Route Changes
[server/db-routes.ts](../server/db-routes.ts): `POST /api/db/memories` and `PUT /api/db/memories/:id`:
- Calculate embedding and write to `vectors` table in the same transaction.
- `DELETE` also removes the vector.

## Open Questions

- **Which embedding generator**: require user's OpenAI key? Or offer local option (Ollama `nomic-embed-text`)? → MVP with OpenAI, add Ollama later as free option.
- **Short-term vs long-term**: still meaningful distinction? Suggestion: short-term appended ALWAYS (sliding window), long-term retrieved semantically.

## Testing

- Unit: `vector-store.ts` cosine-similarity, upsert/search/delete.
- Integration: add 50 memories, run query, verify top-K is relevant.
- Manual: check that prompt size decreases in DevTools Network tab.

## Effort Estimate

~2 units: infrastructure (`rag/*` + DB schema + reindex) + memory wiring. Single session implementation once infra is in place.

