import { describe, expect, it } from 'vitest'
import {
  canonicalizePath,
  validateWorkspaceBoundary,
  checkSensitivePaths,
  isWithinWorkspace,
  translateWindowsToWsl,
  translateWslToWindows,
  resolveRuntimePath,
} from './path-security.js'
import path from 'node:path'
import os from 'node:os'

describe('canonicalizePath', () => {
  it('resolves an existing directory to its real path', () => {
    const result = canonicalizePath(os.tmpdir())
    expect(result).toBeTruthy()
    expect(path.isAbsolute(result!)).toBe(true)
  })

  it('returns a resolved path for non-existent paths', () => {
    const result = canonicalizePath('/nonexistent/path/foo.txt')
    expect(result).toBeTruthy()
    expect(path.isAbsolute(result!)).toBe(true)
  })

  it('normalizes relative paths', () => {
    const result = canonicalizePath(path.join(os.tmpdir(), '..', '..'))
    expect(result).toBeTruthy()
    expect(result).not.toContain('..')
  })
})

describe('validateWorkspaceBoundary', () => {
  const workspace = os.tmpdir()

  it('allows a path within the workspace', () => {
    const result = validateWorkspaceBoundary(workspace, workspace, true)
    expect(result.ok).toBe(true)
  })

  it('allows a subdirectory of workspace', () => {
    const subdir = path.join(workspace, 'subdir')
    const result = validateWorkspaceBoundary(subdir, workspace, true)
    expect(result.ok).toBe(true)
  })

  it('rejects path traversal via ..', () => {
    const result = validateWorkspaceBoundary(
      path.join(workspace, '..', '..', 'etc', 'passwd'),
      workspace,
      true,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('outside the workspace')
    }
  })

  it('rejects absolute path outside workspace', () => {
    const result = validateWorkspaceBoundary('/etc/passwd', workspace, true)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('outside the workspace')
    }
  })

  it('allows the workspace root itself', () => {
    const result = validateWorkspaceBoundary(workspace, workspace, true)
    expect(result.ok).toBe(true)
  })
})

describe('checkSensitivePaths', () => {
  it('denies .git directory', () => {
    expect(checkSensitivePaths('/workspace/.git/config')).toBeTruthy()
    expect(checkSensitivePaths('/workspace/src/.git')).toBeTruthy()
  })

  it('denies .env files', () => {
    expect(checkSensitivePaths('/workspace/.env')).toBeTruthy()
    expect(checkSensitivePaths('/workspace/.env.production')).toBeTruthy()
  })

  it('denies SSH keys', () => {
    expect(checkSensitivePaths('/workspace/id_rsa')).toBeTruthy()
    expect(checkSensitivePaths('/workspace/id_ed25519')).toBeTruthy()
  })

  it('denies .aws directory', () => {
    expect(checkSensitivePaths('/workspace/.aws/credentials')).toBeTruthy()
  })

  it('allows normal file paths', () => {
    expect(checkSensitivePaths('/workspace/src/index.ts')).toBeUndefined()
    expect(checkSensitivePaths('/workspace/README.md')).toBeUndefined()
  })

  it('denies data.db', () => {
    expect(checkSensitivePaths('/workspace/data.db')).toBeTruthy()
  })
})

describe('isWithinWorkspace', () => {
  const workspace = os.tmpdir()

  it('returns true for a workspace subdirectory', () => {
    expect(isWithinWorkspace(path.join(workspace, 'src'), workspace)).toBe(true)
  })

  it('returns false for paths outside workspace', () => {
    expect(isWithinWorkspace('/etc/passwd', workspace)).toBe(false)
  })
})

describe('translateWindowsToWsl', () => {
  it('translates C: drive to /mnt/c', () => {
    expect(translateWindowsToWsl('C:\\Users\\test\\code')).toBe('/mnt/c/Users/test/code')
  })

  it('translates D: drive to /mnt/d', () => {
    expect(translateWindowsToWsl('D:\\projects\\app')).toBe('/mnt/d/projects/app')
  })

  it('handles WSL network paths', () => {
    expect(translateWindowsToWsl('\\\\wsl$\\Ubuntu\\home\\user')).toBe('/home/user')
  })

  it('passes through Unix paths unchanged', () => {
    expect(translateWindowsToWsl('/home/user/code')).toBe('/home/user/code')
  })
})

describe('translateWslToWindows', () => {
  it('translates /mnt/c to C: drive', () => {
    expect(translateWslToWindows('/mnt/c/Users/test/code')).toBe('C:\\Users\\test\\code')
  })

  it('uses distro name for non-mnt paths', () => {
    expect(translateWslToWindows('/home/user/code', 'Ubuntu')).toBe('\\\\wsl$\\Ubuntu\\home\\user\\code')
  })
})

describe('resolveRuntimePath', () => {
  it('returns same path when workspace and runtime match (wsl)', () => {
    expect(resolveRuntimePath('/home/user/code', 'wsl', 'wsl-pwsh')).toBe('/home/user/code')
  })

  it('returns same path when workspace and runtime match (windows)', () => {
    expect(resolveRuntimePath('C:\\Users\\test\\code', 'windows', 'windows-powershell')).toBe('C:\\Users\\test\\code')
  })

  it('translates Windows path when using WSL runtime', () => {
    expect(resolveRuntimePath('C:\\code', 'windows', 'wsl-pwsh')).toBe('/mnt/c/code')
  })

  it('translates WSL path when using Windows runtime', () => {
    expect(resolveRuntimePath('/mnt/c/code', 'wsl', 'windows-powershell')).toBe('C:\\code')
  })
})
