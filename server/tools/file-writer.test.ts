import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileWriterTool } from './file-writer.js'

type Result = {
  path?: string
  size?: number
  mode?: 'written' | 'appended'
  error?: string
}

async function write(input: { path: string; content: string; append?: boolean }) {
  return (await fileWriterTool.execute!(input as never, {
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
  dir = await mkdtemp(path.join(tmpdir(), 'file-writer-'))
})

afterEach(async () => {
  if (ORIGINAL_FULL_ACCESS === undefined) delete process.env.ALLOW_FULL_FS_ACCESS
  else process.env.ALLOW_FULL_FS_ACCESS = ORIGINAL_FULL_ACCESS
  await rm(dir, { recursive: true, force: true })
})

describe('fileWriterTool', () => {
  it('writes a new file with utf-8 contents', async () => {
    const file = path.join(dir, 'a.txt')
    const r = await write({ path: file, content: 'hello world' })
    expect(r.error).toBeUndefined()
    expect(r.path).toBe(file)
    expect(r.mode).toBe('written')
    expect(r.size).toBe(11)
    expect(await readFile(file, 'utf-8')).toBe('hello world')
  })

  it('overwrites an existing file by default', async () => {
    const file = path.join(dir, 'overwrite.txt')
    await writeFile(file, 'old', 'utf-8')

    const r = await write({ path: file, content: 'new' })
    expect(r.mode).toBe('written')
    expect(await readFile(file, 'utf-8')).toBe('new')
  })

  it('appends when append is true', async () => {
    const file = path.join(dir, 'append.txt')
    await writeFile(file, 'first ', 'utf-8')

    const r = await write({ path: file, content: 'second', append: true })
    expect(r.mode).toBe('appended')
    expect(await readFile(file, 'utf-8')).toBe('first second')
  })

  it('creates missing parent directories', async () => {
    const file = path.join(dir, 'nested', 'deeper', 'file.txt')
    const r = await write({ path: file, content: 'hi' })
    expect(r.error).toBeUndefined()
    expect((await stat(file)).isFile()).toBe(true)
  })

  it('rejects content larger than 10MB', async () => {
    const file = path.join(dir, 'big.txt')
    const content = 'x'.repeat(10 * 1024 * 1024 + 1)
    const r = await write({ path: file, content })
    expect(r.error).toMatch(/Content too large/)
    // The file should NOT have been created.
    await expect(stat(file)).rejects.toThrow()
  })

  it('reports byte-count, not character-count, for size', async () => {
    const file = path.join(dir, 'utf.txt')
    // Two-byte (UTF-8) char.
    const r = await write({ path: file, content: 'ä' })
    expect(r.size).toBe(2)
  })
})
