import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { query, queryOne, run } from '../db.js'
import { embedMany, embedOne } from './embeddings.js'
import { deleteBySource, searchVectors, upsertVector } from './vector-store.js'
import { splitText } from './text-splitter.js'

/**
 * Document indexer for the `index_document` / `search_document` tools.
 *
 * Each path gets a stable `documentId` (sha256 of the absolute path), so
 * `documentId`s previously returned to the LLM remain valid after a
 * re-index of the same file. Re-indexing is mtime-gated — calling
 * `indexDocument` twice on an unchanged file is a no-op.
 */

const MAX_PDF_SIZE = 100 * 1024 * 1024 // 100 MB
const MAX_TEXT_SIZE = 25 * 1024 * 1024 // 25 MB
const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 150

export interface IndexedDocumentRow {
  id: string
  path: string
  mtime: number
  chunk_count: number
  indexed_at: number
}

export interface IndexResult {
  documentId: string
  path: string
  chunks: number
  reused: boolean
}

export interface SearchedChunk {
  content: string
  chunkIndex: number
  page?: number
  score: number
}

function documentIdFor(absPath: string): string {
  return 'doc_' + crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 24)
}

interface PreparedChunk {
  content: string
  metadata: Record<string, unknown>
}

async function loadAndSplit(absPath: string, ext: string): Promise<PreparedChunk[]> {
  if (ext === '.pdf') {
    const buffer = await readFile(absPath)
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    await parser.destroy()

    const out: PreparedChunk[] = []
    let chunkIndex = 0
    result.pages.forEach((page, idx) => {
      const pageNumber = idx + 1
      const pageChunks = splitText(page.text ?? '', {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      })
      for (const content of pageChunks) {
        out.push({
          content,
          metadata: { chunkIndex, page: pageNumber, path: absPath },
        })
        chunkIndex++
      }
    })
    return out
  }

  const text = await readFile(absPath, { encoding: 'utf-8' })
  const chunks = splitText(text, { chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP })
  return chunks.map((content, chunkIndex) => ({
    content,
    metadata: { chunkIndex, path: absPath },
  }))
}

export async function indexDocument(params: { apiKey: string; path: string }): Promise<IndexResult> {
  const { apiKey, path: rawPath } = params
  if (!apiKey) throw new Error('OpenAI API key is required to index documents')

  const absPath = path.resolve(rawPath)
  const stats = await stat(absPath)
  if (!stats.isFile()) throw new Error(`"${absPath}" is not a regular file`)

  const ext = path.extname(absPath).toLowerCase()
  const sizeLimit = ext === '.pdf' ? MAX_PDF_SIZE : MAX_TEXT_SIZE
  if (stats.size > sizeLimit) {
    throw new Error(
      `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max ${sizeLimit / 1024 / 1024}MB for ${ext || 'text'} files)`,
    )
  }

  const documentId = documentIdFor(absPath)
  const mtime = Math.floor(stats.mtimeMs)

  const existing = queryOne<IndexedDocumentRow>('SELECT * FROM documents WHERE path=$path', { path: absPath })
  if (existing && existing.mtime === mtime && existing.chunk_count > 0) {
    return { documentId: existing.id, path: absPath, chunks: existing.chunk_count, reused: true }
  }

  if (existing) {
    deleteBySource('document', existing.id)
  }

  const prepared = await loadAndSplit(absPath, ext)
  if (prepared.length === 0) {
    throw new Error('No content could be extracted from this document')
  }

  const embeddings = await embedMany(apiKey, prepared.map((p) => p.content))
  for (let i = 0; i < prepared.length; i++) {
    const chunk = prepared[i]
    upsertVector({
      id: `doc:${documentId}:${i}`,
      sourceType: 'document',
      sourceId: documentId,
      content: chunk.content,
      embedding: embeddings[i],
      metadata: chunk.metadata,
    })
  }

  run(
    `INSERT INTO documents (id, path, mtime, chunk_count, indexed_at)
     VALUES ($id, $path, $mtime, $chunkCount, $indexedAt)
     ON CONFLICT(path) DO UPDATE SET
       id = excluded.id,
       mtime = excluded.mtime,
       chunk_count = excluded.chunk_count,
       indexed_at = excluded.indexed_at`,
    {
      id: documentId,
      path: absPath,
      mtime,
      chunkCount: prepared.length,
      indexedAt: Date.now(),
    },
  )

  return { documentId, path: absPath, chunks: prepared.length, reused: false }
}

export async function searchDocument(params: {
  apiKey: string
  documentId: string
  query: string
  k?: number
}): Promise<{ chunks: SearchedChunk[] }> {
  const { apiKey, documentId, query: queryText, k = 5 } = params
  if (!apiKey) throw new Error('OpenAI API key is required to search documents')
  if (!queryText.trim()) return { chunks: [] }

  const exists = queryOne<IndexedDocumentRow>('SELECT * FROM documents WHERE id=$id', { id: documentId })
  if (!exists) {
    throw new Error(`Document not found: ${documentId}. Call index_document first.`)
  }

  const queryEmbedding = await embedOne(apiKey, queryText)
  const hits = searchVectors({
    sourceType: 'document',
    sourceId: documentId,
    queryEmbedding,
    k,
  })

  const chunks: SearchedChunk[] = hits.map((hit) => {
    const meta = hit.metadata as { chunkIndex?: number; page?: number }
    return {
      content: hit.content,
      chunkIndex: meta.chunkIndex ?? 0,
      page: meta.page,
      score: hit.score,
    }
  })
  return { chunks }
}

export function listIndexedDocuments(): IndexedDocumentRow[] {
  return query<IndexedDocumentRow>('SELECT * FROM documents ORDER BY indexed_at DESC')
}

export function deleteIndexedDocument(documentId: string): boolean {
  const existing = queryOne<IndexedDocumentRow>('SELECT * FROM documents WHERE id=$id', { id: documentId })
  if (!existing) return false
  deleteBySource('document', documentId)
  run('DELETE FROM documents WHERE id=$id', { id: documentId })
  return true
}
