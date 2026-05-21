import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ─── Mocks ──────────────────────────────────────────────────────────────
// Mock embeddings before importing document-index.

const embedDocuments = vi.fn(async (texts: string[]) =>
  texts.map((text) => {
    // Deterministic 1536-d unit vector seeded by a simple hash so different
    // chunk contents get different embeddings (otherwise cosine ranking is
    // meaningless and tests can't distinguish documents).
    const out = new Array(1536).fill(0)
    let h = 0
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
    for (let i = 0; i < 1536; i++) {
      out[i] = Math.sin((h + i) * 0.1)
    }
    const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0))
    return out.map((x) => x / norm)
  }),
)
const embedQuery = vi.fn(async (text: string) => {
  const out = new Array(1536).fill(0)
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  for (let i = 0; i < 1536; i++) {
    out[i] = Math.sin((h + i) * 0.1)
  }
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0))
  return out.map((x) => x / norm)
})

vi.mock('@langchain/openai', () => {
  class OpenAIEmbeddings {
    embedDocuments = embedDocuments
    embedQuery = embedQuery
    constructor() {}
  }
  return { OpenAIEmbeddings }
})

// ─── Test setup ─────────────────────────────────────────────────────────
// db.ts derives its data dir from `os.homedir()`, so we point HOME at a
// throwaway directory before importing it.

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-chat-doctest-'))
const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_PASSWORD = process.env.LLM_CHAT_MASTER_PASSWORD
process.env.HOME = TMP_HOME
delete process.env.LLM_CHAT_MASTER_PASSWORD

const { initDb, closeDb } = await import('../db.js')
const { indexDocument, searchDocument } = await import('./document-index.js')

beforeAll(async () => {
  await initDb()
})

afterAll(() => {
  closeDb()
  process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_PASSWORD !== undefined) {
    process.env.LLM_CHAT_MASTER_PASSWORD = ORIGINAL_PASSWORD
  }
  fs.rmSync(TMP_HOME, { recursive: true, force: true })
})

function writeTempFile(name: string, content: string): string {
  const filePath = path.join(TMP_HOME, name)
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('indexDocument', () => {
  it('indexes a text file and returns a stable documentId', async () => {
    const filePath = writeTempFile('sample.txt', 'The quick brown fox. '.repeat(100))
    const result = await indexDocument({ apiKey: 'sk-test', path: filePath })
    expect(result.documentId).toMatch(/^doc_/)
    expect(result.chunks).toBeGreaterThan(0)
    expect(result.reused).toBe(false)
  })

  it('short-circuits when the file is unchanged (mtime dedup)', async () => {
    const filePath = writeTempFile('dedup.txt', 'Hello world. '.repeat(50))
    const first = await indexDocument({ apiKey: 'sk-test', path: filePath })
    const callsAfterFirst = embedDocuments.mock.calls.length

    const second = await indexDocument({ apiKey: 'sk-test', path: filePath })
    expect(second.documentId).toBe(first.documentId)
    expect(second.chunks).toBe(first.chunks)
    expect(second.reused).toBe(true)
    // No new embedding call on the dedup path.
    expect(embedDocuments.mock.calls.length).toBe(callsAfterFirst)
  })

  it('re-indexes when mtime changes', async () => {
    const filePath = writeTempFile('changing.txt', 'original content '.repeat(40))
    const first = await indexDocument({ apiKey: 'sk-test', path: filePath })

    // Bump mtime forward and rewrite.
    fs.writeFileSync(filePath, 'updated content with more text '.repeat(60), 'utf-8')
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(filePath, future, future)

    const second = await indexDocument({ apiKey: 'sk-test', path: filePath })
    expect(second.documentId).toBe(first.documentId)
    expect(second.reused).toBe(false)
  })

  it('rejects oversize files', async () => {
    // Use a large fake size by writing a buffer; cap is 25MB for text, so
    // generate ~26MB of repeating ASCII.
    const filePath = path.join(TMP_HOME, 'huge.txt')
    const fd = fs.openSync(filePath, 'w')
    const buf = Buffer.alloc(1024 * 1024, 'a')
    for (let i = 0; i < 26; i++) fs.writeSync(fd, buf)
    fs.closeSync(fd)

    await expect(indexDocument({ apiKey: 'sk-test', path: filePath })).rejects.toThrow(/too large/i)
  })
})

describe('searchDocument', () => {
  it('only returns chunks from the requested document', async () => {
    const a = writeTempFile('alpha.txt', 'ALPHA token alpha alpha. '.repeat(20))
    const b = writeTempFile('beta.txt', 'BETA token beta beta. '.repeat(20))

    const docA = await indexDocument({ apiKey: 'sk-test', path: a })
    const docB = await indexDocument({ apiKey: 'sk-test', path: b })
    expect(docA.documentId).not.toBe(docB.documentId)

    const resultA = await searchDocument({
      apiKey: 'sk-test',
      documentId: docA.documentId,
      query: 'alpha',
      k: 3,
    })
    expect(resultA.chunks.length).toBeGreaterThan(0)
    for (const chunk of resultA.chunks) {
      expect(chunk.content).not.toContain('BETA')
    }
  })

  it('throws on an unknown documentId', async () => {
    await expect(
      searchDocument({ apiKey: 'sk-test', documentId: 'doc_nonexistent', query: 'anything' }),
    ).rejects.toThrow(/not found/i)
  })

  it('returns an empty list for an empty query', async () => {
    const filePath = writeTempFile('empty-query.txt', 'something '.repeat(30))
    const doc = await indexDocument({ apiKey: 'sk-test', path: filePath })
    const result = await searchDocument({ apiKey: 'sk-test', documentId: doc.documentId, query: '   ' })
    expect(result.chunks).toEqual([])
  })
})
