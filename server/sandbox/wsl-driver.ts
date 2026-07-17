/**
 * WSL Bubblewrap Sandbox Driver.
 *
 * Executes PowerShell scripts inside WSL2 using bubblewrap (bwrap) for
 * filesystem and network isolation. This is the reference sandbox
 * implementation and the primary driver for WSL-based projects.
 *
 * Sandbox properties:
 * - System binaries are read-only bind-mounted
 * - Project workspace is the only writable host path
 * - HOME and TEMP are empty tmpfs mounts
 * - Network is isolated by default (--unshare-net)
 * - Process dies with parent (--die-with-parent)
 * - PID namespace isolation (--unshare-pid)
 */

import { execFile, execSync } from 'node:child_process'
import type {
  SandboxDriver,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  ProjectWorkspace,
} from '../lib/sandbox-types.js'
import { buildSafeEnv } from '../lib/env-sanitizer.js'
import { resolveRuntimePath } from '../lib/path-security.js'

// Maximum output before truncation
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024 // 1 MiB

// Maximum timeout
const MAX_TIMEOUT_MS = 900_000

// ---------------------------------------------------------------------------
// Prerequisites check
// ---------------------------------------------------------------------------

interface PrerequisiteStatus {
  ok: boolean
  missing: string[]
}

let cachedPrerequisites: PrerequisiteStatus | null = null
let prerequisiteCacheTime = 0
const PREREQUISITE_CACHE_MS = 30_000

function execQuiet(command: string, args: string[]): boolean {
  try {
    execSync(`${command} ${args.join(' ')}`, { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Check if WSL, bubblewrap, and pwsh are available.
 * Results are cached for 30 seconds.
 */
export function checkWslPrerequisites(): PrerequisiteStatus {
  if (cachedPrerequisites && Date.now() - prerequisiteCacheTime < PREREQUISITE_CACHE_MS) {
    return cachedPrerequisites
  }

  const missing: string[] = []

  // Check if we're on Linux or WSL
  if (process.platform === 'linux') {
    // Native Linux — check bwrap and pwsh directly
    if (!execQuiet('bwrap', ['--version'])) {
      missing.push('bubblewrap (bwrap) — install with: apt install bubblewrap')
    }
    if (!execQuiet('pwsh', ['--version'])) {
      missing.push('PowerShell (pwsh) — install with: snap install powershell or apt install powershell')
    }
  } else if (process.platform === 'win32') {
    // Windows — check WSL availability
    if (!execQuiet('wsl', ['--version'])) {
      missing.push('WSL2 — install with: wsl --install')
    } else {
      // Check bwrap inside WSL
      if (!execQuiet('wsl', ['--', 'bash', '-c', 'command -v bwrap'])) {
        missing.push('bubblewrap inside WSL — run: sudo apt install bubblewrap')
      }
      // Check pwsh inside WSL
      if (!execQuiet('wsl', ['--', 'bash', '-c', 'command -v pwsh'])) {
        missing.push('PowerShell inside WSL — install pwsh in your WSL distro')
      }
    }
  } else {
    missing.push(`Unsupported platform: ${process.platform}`)
  }

  cachedPrerequisites = { ok: missing.length === 0, missing }
  prerequisiteCacheTime = Date.now()
  return cachedPrerequisites
}

/** Reset cached prerequisites (for tests). */
export function _resetPrerequisiteCache(): void {
  cachedPrerequisites = null
  prerequisiteCacheTime = 0
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class WslSandboxDriver implements SandboxDriver {
  readonly kind = 'wsl-bwrap' as const

  async isAvailable(): Promise<boolean> {
    return checkWslPrerequisites().ok
  }

  async execute(
    req: SandboxExecutionRequest,
    workspace: ProjectWorkspace,
  ): Promise<SandboxExecutionResult> {
    const startTime = Date.now()

    // Resolve the runtime-appropriate canonical path
    const runtimePath = resolveRuntimePath(
      workspace.workspacePath,
      workspace.workspaceKind,
      workspace.preferredRuntime,
    )

    // Build the sandbox command
    const { cmd, args } = this.buildBwrapCommand(
      runtimePath,
      req.cwd,
      req.resources?.network ?? false,
    )

    // Build safe environment
    const env = buildSafeEnv(process.env)

    // Execution timeout
    const timeoutMs = Math.min(
      (req.timeoutSeconds ?? 120) * 1000,
      MAX_TIMEOUT_MS,
    )

    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = execFile(
            cmd,
            args,
            {
              env,
              timeout: timeoutMs,
              maxBuffer: MAX_OUTPUT_BYTES,
              encoding: 'utf-8',
            },
            (error, stdout, stderr) => {
              if (error) {
                reject(Object.assign(error, { stdout, stderr }))
              } else {
                resolve({ stdout: stdout || '', stderr: stderr || '' })
              }
            },
          )
          // Pipe script via stdin
          if (child.stdin) {
            child.stdin.write(req.script)
            child.stdin.end()
          }
        },
      )

      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        timedOut: false,
        sandbox: this.kind,
        runtime: req.runtime,
        durationMs: Date.now() - startTime,
      }
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean }

      // Timeout
      if (err.killed || err.code === 'ETIMEDOUT') {
        return {
          stdout: (err.stdout || '') as string,
          stderr: (err.stderr || '') as string + '\n[Process timed out]',
          exitCode: 124,
          timedOut: true,
          sandbox: this.kind,
          runtime: req.runtime,
          durationMs: Date.now() - startTime,
        }
      }

      // Non-zero exit
      if ('code' in err && typeof err.code === 'number') {
        return {
          stdout: (err.stdout || '') as string,
          stderr: (err.stderr || '') as string,
          exitCode: err.code,
          timedOut: false,
          sandbox: this.kind,
          runtime: req.runtime,
          durationMs: Date.now() - startTime,
        }
      }

      // Spawn failure
      return {
        stdout: '',
        stderr: `Failed to spawn sandbox: ${err.message}`,
        exitCode: 1,
        timedOut: false,
        sandbox: this.kind,
        runtime: req.runtime,
        durationMs: Date.now() - startTime,
      }
    }
  }

  canonicalizePath(workspacePath: string): string {
    return workspacePath
  }

  /**
   * Build the bwrap command and arguments.
   *
   * The sandbox layout:
   * - Read-only bind of /usr, /lib, /lib64, /bin (system)
   * - Read-only bind of /etc (config, but no secrets from parent)
   * - Writable bind of the workspace directory
   * - tmpfs for /home, /tmp, /root (empty, ephemeral)
   * - /dev, /proc from host
   * - Network isolation (default)
   * - pid namespace isolation
   * - die-with-parent
   *
   * Script is piped to pwsh via stdin with -NoLogo -NoProfile -NonInteractive.
   */
  private buildBwrapCommand(
    workspacePath: string,
    cwd?: string,
    allowNetwork = false,
  ): { cmd: string; args: string[] } {
    // Determine if bwrap needs to be run via wsl
    const useWsl = process.platform === 'win32'
    const cmd = useWsl ? 'wsl' : 'bwrap'

    const bwrapArgs: string[] = []

    if (useWsl) {
      bwrapArgs.push('--', 'bwrap')
    }

    // System mounts (read-only)
    bwrapArgs.push(
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/lib64', '/lib64',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/etc', '/etc',
      '--ro-bind', '/opt', '/opt',
    )

    // Workspace writable mount
    bwrapArgs.push('--bind', workspacePath, workspacePath)

    // Ephemeral home and temp
    bwrapArgs.push(
      '--tmpfs', '/home',
      '--tmpfs', '/tmp',
      '--tmpfs', '/root',
      '--tmpfs', '/run',
    )

    // Device and proc
    bwrapArgs.push(
      '--dev', '/dev',
      '--proc', '/proc',
    )

    // Network isolation
    if (!allowNetwork) {
      bwrapArgs.push('--unshare-net')
    }

    // Process isolation
    bwrapArgs.push(
      '--unshare-pid',
      '--die-with-parent',
    )

    // Working directory
    if (cwd) {
      const cwdPath = cwd.startsWith('/') ? cwd : `${workspacePath}/${cwd}`
      bwrapArgs.push('--chdir', cwdPath)
    } else {
      bwrapArgs.push('--chdir', workspacePath)
    }

    // Separator before the inner command
    bwrapArgs.push('--')

    // PowerShell with safe flags
    bwrapArgs.push(
      'pwsh',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command', '-',  // Read script from stdin
    )

    return { cmd, args: bwrapArgs }
  }
}

// Singleton instance
export const wslDriver = new WslSandboxDriver()
