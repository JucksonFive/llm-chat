import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileReaderTool } from './file-reader.js'

type Result = {
  path?: string
  size?: number
  lines?: number
  content?: string
  error?: string
}

async function read(input: { path: string; encoding?: string; maxLines?: number }) {
  return (await fileReaderTool.execute!(input as never, {
    toolCallId: 't',
    messages: [],
  } as never)) as Result
}

let dir: string
const ORIGINAL_FULL_ACCESS = process.env.ALLOW_FULL_FS_ACCESS

beforeEach(async () => {
  // These tests exercise raw file IO against temp dirs outside the workspace,
  // so opt into full filesystem access. Workspace boundary enforcement is
  // covered by server/lib/workspace.test.ts.
  process.env.ALLOW_FULL_FS_ACCESS = 'true'
  dir = await mkdtemp(path.join(tmpdir(), 'file-reader-'))
})

afterEach(async () => {
  if (ORIGINAL_FULL_ACCESS === undefined) delete process.env.ALLOW_FULL_FS_ACCESS
  else process.env.ALLOW_FULL_FS_ACCESS = ORIGINAL_FULL_ACCESS
  await rm(dir, { recursive: true, force: true })
})

describe('fileReaderTool', () => {
  it('reads a small UTF-8 file', async () => {
    const file = path.join(dir, 'hello.txt')
    await writeFile(file, 'one\ntwo\nthree\n', 'utf-8')

    const r = await read({ path: file })
    expect(r.error).toBeUndefined()
    expect(r.path).toBe(file)
    expect(r.content).toBe('one\ntwo\nthree\n')
    expect(r.size).toBe(14)
    expect(r.lines).toBe(4) // trailing newline produces an empty line
  })

  it('returns ENOENT-mapped error for missing files', async () => {
    const r = await read({ path: path.join(dir, 'does-not-exist') })
    expect(r.error).toMatch(/File not found/)
  })

  it('refuses to read directories', async () => {
    const r = await read({ path: dir })
    expect(r.error).toMatch(/not a regular file/)
  })

  it('truncates output when maxLines is set', async () => {
    const file = path.join(dir, 'long.txt')
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    await writeFile(file, lines, 'utf-8')

    const r = await read({ path: file, maxLines: 5 })
    expect(r.error).toBeUndefined()
    expect(r.content).toContain('line 1')
    expect(r.content).toContain('line 5')
    expect(r.content).not.toContain('line 6\n')
    expect(r.content).toMatch(/Truncated: showing 5 of 100 lines/)
  })

  it('does not truncate when file has fewer lines than maxLines', async () => {
    const file = path.join(dir, 'short.txt')
    await writeFile(file, 'a\nb\n', 'utf-8')

    const r = await read({ path: file, maxLines: 100 })
    expect(r.content).toBe('a\nb\n')
    expect(r.content).not.toMatch(/Truncated/)
  })

  it('respects the encoding option', async () => {
    const file = path.join(dir, 'latin1.txt')
    await writeFile(file, Buffer.from([0xe4, 0xf6])) // ä, ö in latin1

    const r = await read({ path: file, encoding: 'latin1' })
    expect(r.content).toBe('äö')
  })
})
