# Plan 02 — Document RAG Tool (PDF + Files)

## Goal

Add a new built-in tool `search_document` that allows the LLM to semantically query large documents instead of loading the entire file into the prompt.

## Current State

- [pdf-reader.ts](../server/tools/pdf-reader.ts): reads entire PDF, truncates to 200k chars → large prompt, breaks on 500-page reports.
- [file-reader.ts](../server/tools/file-reader.ts): same problem for text files.

## End State

Two tools:
1. **`index_document(path)`** — loads, chunks, embeds, saves. Returns `documentId`.
2. **`search_document(documentId, query, k=5)`** — returns top-K most relevant chunks.

LLM workflow: user mentions PDF → LLM calls `index_document` once → then multiple `search_document` calls for questions.

Bonus: [pdf-reader.ts](../server/tools/pdf-reader.ts) and [file-reader.ts](../server/tools/file-reader.ts) remain for quick reads of small files.

## Prerequisite

**Plan 01** is implemented → `server/rag/*` infrastructure available.

## Technical Changes

### 1. Dependencies (partially from plan 01)
```
pnpm add @langchain/community   # PDFLoader, TextLoader
```

### 2. New Files

**`server/tools/document-indexer.ts`** (new)
- `indexDocumentTool`:
  - Input: `{ path: string }`
  - Load: `.pdf` → `PDFLoader`, else → `TextLoader`.
  - Chunk: `RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 })`.
  - Embed: use `server/rag/embeddings.ts`.
  - Save: `server/rag/vector-store.ts#upsertVector` with metadata `{ path, chunkIndex, page? }`.
  - Return: `{ documentId, chunks: number, path }`.
- Deduplication: if same `path` already indexed and file hasn't changed (mtime check) → return existing `documentId`.

**`server/tools/document-search.ts`** (new)
- `searchDocumentTool`:
  - Input: `{ documentId: string, query: string, k?: number }`
  - Embed query → `searchVectors` with filter `metadata.documentId == documentId`.
  - Return `{ chunks: [{ content, page?, score }] }`.

### 3. Registration

[server/tools/index.ts](../server/tools/index.ts): add both to `BuiltInToolId` list and `getBuiltInTools` map.

### 4. DB Schema

Add to [server/db.ts](../server/db.ts):
```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  mtime INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);
```
Use `source_type='document'` and `source_id=documentId` in `vectors` table.

### 5. UI
[src/components/settings/](../src/components/settings/) or built-in-tools settings: add both tools to list.

Optional: "Indexed documents" view where users can see and delete indexed documents.

### 6. System Prompt Hint

[server/index.ts](../server/index.ts) tool guidelines section:
> "For large documents (PDFs over 20 pages or text files over 50k chars), use `index_document` first, then `search_document` with specific queries instead of reading the whole file."

## Edge Cases

- Same file changed: delete old chunks (`deleteBySource('document', oldDocumentId)`), re-index.
- Large PDF (>100MB): set limit and clear error message.
- Binary/corrupted PDF: catch `PDFLoader` error, return user-friendly message.

## Testing

- Index 300-page PDF, ask 5 different questions, verify correct pages found.
- Measure: prompt size before (`read_pdf`) vs after (`search_document`) — expect: 100k+ → <5k tokens.

## Effort Estimate

Small if plan 01 is done. Mostly loader integration and tool definition.

