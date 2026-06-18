import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getWorkspaceRoot,
  isFullFsAccessAllowed,
  resolveWorkspace,
  validateWorkspaceAccess,
  prepareWorkspacePath,
} from './workspace.js'

let tmpRoot: string
const ORIGINAL_WORKSPACE_ROOT = process.env.WORKSPACE_ROOT
const ORIGINAL_FULL_ACCESS = process.env.ALLOW_FULL_FS_ACCESS

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'llm-chat-ws-'))
  process.env.WORKSPACE_ROOT = path.join(tmpRoot, 'workspace')
  delete process.env.ALLOW_FULL_FS_ACCESS
})

afterEach(() => {
  // Restore env
  if (ORIGINAL_WORKSPACE_ROOT === undefined) delete process.env.WORKSPACE_ROOT
  else process.env.WORKSPACE_ROOT = ORIGINAL_WORKSPACE_ROOT
  if (ORIGINAL_FULL_ACCESS === undefined) delete process.env.ALLOW_FULL_FS_ACCESS
  else process.env.ALLOW_FULL_FS_ACCESS = ORIGINAL_FULL_ACCESS

  try {
    rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('getWorkspaceRoot', () => {
  it('uses WORKSPACE_ROOT env when set', () => {
    expect(getWorkspaceRoot()).toBe(path.resolve(path.join(tmpRoot, 'workspace')))
  })

  it('defaults to ~/.llm-chat/workspace when unset', () => {
    delete process.env.WORKSPACE_ROOT
    expect(getWorkspaceRoot()).toBe(
      path.resolve(path.join(os.homedir(), '.llm-chat', 'workspace')),
    )
  })
})

describe('resolveWorkspace', () => {
  it('auto-creates the workspace root on first use', () => {
    const root = getWorkspaceRoot()
    expect(existsSync(root)).toBe(false)
    resolveWorkspace('notes.txt')
    expect(existsSync(root)).toBe(true)
  })

  it('anchors relative paths to the workspace root', () => {
    const resolved = resolveWorkspace('sub/notes.txt')
    expect(resolved).toBe(path.join(getWorkspaceRoot(), 'sub', 'notes.txt'))
  })

  it('honors absolute paths as-is (for later boundary validation)', () => {
    const resolved = resolveWorkspace('/etc/passwd')
    expect(resolved).toBe(path.resolve('/etc/passwd'))
  })

  it('resolves against cwd when full FS access is enabled', () => {
    process.env.ALLOW_FULL_FS_ACCESS = 'true'
    expect(resolveWorkspace('/etc/passwd')).toBe(path.resolve('/etc/passwd'))
  })
})

describe('validateWorkspaceAccess — boundary enforcement', () => {
  it('allows files inside the workspace', () => {
    const inside = path.join(getWorkspaceRoot(), 'notes.txt')
    expect(validateWorkspaceAccess(inside).ok).toBe(true)
  })

  it('allows nested files inside the workspace', () => {
    const inside = path.join(getWorkspaceRoot(), 'a', 'b', 'c.txt')
    expect(validateWorkspaceAccess(inside).ok).toBe(true)
  })

  it('denies absolute paths outside the workspace', () => {
    const res = validateWorkspaceAccess('/etc/passwd')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('outside the workspace')
  })

  it('denies traversal escaping the workspace', () => {
    const escape = path.resolve(getWorkspaceRoot(), '..', '..', 'secret.txt')
    const res = validateWorkspaceAccess(escape)
    expect(res.ok).toBe(false)
  })

  it('denies sibling directory with shared prefix', () => {
    const root = getWorkspaceRoot()
    const sibling = root + '-evil/file.txt'
    const res = validateWorkspaceAccess(path.resolve(sibling))
    expect(res.ok).toBe(false)
  })
})

describe('validateWorkspaceAccess — deny-list', () => {
  it('denies data.db even inside the workspace', () => {
    const res = validateWorkspaceAccess(path.join(getWorkspaceRoot(), 'data.db'))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('protected')
  })

  it('denies audit.log even inside the workspace', () => {
    const res = validateWorkspaceAccess(path.join(getWorkspaceRoot(), 'audit.log'))
    expect(res.ok).toBe(false)
  })

  it('denies *.key files', () => {
    const res = validateWorkspaceAccess(path.join(getWorkspaceRoot(), 'server.key'))
    expect(res.ok).toBe(false)
  })

  it('denies *.pem files', () => {
    const res = validateWorkspaceAccess(path.join(getWorkspaceRoot(), 'cert.pem'))
    expect(res.ok).toBe(false)
  })

  it('deny-list applies even with full FS access enabled', () => {
    process.env.ALLOW_FULL_FS_ACCESS = 'true'
    const res = validateWorkspaceAccess('/home/user/secret.pem')
    expect(res.ok).toBe(false)
  })

  it('allows non-sensitive files', () => {
    const res = validateWorkspaceAccess(path.join(getWorkspaceRoot(), 'keynote.txt'))
    expect(res.ok).toBe(true)
  })
})

describe('full FS access opt-in', () => {
  it('is off by default', () => {
    expect(isFullFsAccessAllowed()).toBe(false)
  })

  it('respects truthy values', () => {
    for (const v of ['true', '1', 'yes']) {
      process.env.ALLOW_FULL_FS_ACCESS = v
      expect(isFullFsAccessAllowed()).toBe(true)
    }
  })

  it('treats other values as off', () => {
    process.env.ALLOW_FULL_FS_ACCESS = 'false'
    expect(isFullFsAccessAllowed()).toBe(false)
  })

  it('allows paths outside the workspace when enabled', () => {
    process.env.ALLOW_FULL_FS_ACCESS = 'true'
    expect(validateWorkspaceAccess('/etc/hosts').ok).toBe(true)
  })
})

describe('prepareWorkspacePath', () => {
  it('returns resolved path for allowed targets', () => {
    const res = prepareWorkspacePath('notes.txt')
    expect('resolved' in res).toBe(true)
    if ('resolved' in res) {
      expect(res.resolved).toBe(path.join(getWorkspaceRoot(), 'notes.txt'))
    }
  })

  it('returns error for denied targets', () => {
    const res = prepareWorkspacePath('/etc/passwd')
    expect('error' in res).toBe(true)
  })

  it('returns error for deny-listed targets', () => {
    const res = prepareWorkspacePath('data.db')
    expect('error' in res).toBe(true)
  })
})
