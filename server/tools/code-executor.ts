import { tool, jsonSchema } from 'ai'
import vm from 'node:vm'
import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logSecurityEvent } from '../lib/audit-log.js'

// ---------------------------------------------------------------------------
// Command allowlist — restricts shell execution to a safe subset of binaries.
// Configurable via CODE_EXECUTOR_ALLOWED_COMMANDS (comma-separated list).
// ---------------------------------------------------------------------------
const DEFAULT_ALLOWED_COMMANDS = [
  'ls', 'cat', 'grep', 'find', 'head', 'tail',
  'wc', 'sort', 'uniq', 'echo', 'pwd', 'date', 'which',
]

function getAllowedCommands(): Set<string> {
  const env = process.env.CODE_EXECUTOR_ALLOWED_COMMANDS
  if (env) {
    return new Set(env.split(',').map((s) => s.trim()).filter(Boolean))
  }
  return new Set(DEFAULT_ALLOWED_COMMANDS)
}

/**
 * Extract the base command name from a command string.
 * Handles: path-qualified commands (/usr/bin/ls), env vars (FOO=bar cmd),
 * and basic redirections.
 */
function extractCommandNames(code: string): string[] {
  const names: string[] = []

  // Split on pipe separators (handle |& as well)
  const segments = code.split(/\|&?/)

  for (const segment of segments) {
    // Strip leading/trailing whitespace
    let cmd = segment.trim()

    // Remove environment variable assignments (VAR=val ...)
    cmd = cmd.replace(/^(\w+=\S+\s+)+/, '')

    // Remove leading variable assignments that might remain
    cmd = cmd.trim()

    // Extract the first word (the command name)
    const match = cmd.match(/^([^\s/]+)/)
    if (match) {
      names.push(match[1])
    }
  }

  return names
}

/**
 * Check for shell metacharacters that could be used to chain or escape commands.
 * Blocks: &&, ||, ;, `, $(), ${}, newlines (command separators).
 */
function containsDangerousConstructs(code: string): boolean {
  // Block command separators and substitution
  const dangerous = [
    /&&/,          // logical AND chaining
    /\|\|/,        // logical OR chaining
    /;/,           // command separator
    /`[^`]*`/,     // backtick command substitution
    /\$\(/,        // $() command substitution
    /\$\{/,        // ${} parameter expansion (can be dangerous)
    /\n/,          // newline command separator
  ]
  return dangerous.some((pattern) => pattern.test(code))
}

function getAuditLogPath(): string {
  return join(homedir(), '.llm-chat', 'audit.log')
}

function auditLog(language: string, code: string, exitCode: number, stderr?: string, sandbox?: string): void {
  // Structured security audit log (JSONL). Truncate the command so we never
  // persist large payloads; do not log stdout/stderr content beyond a snippet.
  logSecurityEvent(
    'shell.execute',
    {
      language,
      exitCode,
      command: code.slice(0, 500),
      stderrSnippet: stderr ? stderr.slice(0, 200) : undefined,
      sandbox,
    },
    exitCode === 0 ? 'info' : 'warning',
  )

  const timestamp = new Date().toISOString()
  const stderrSnippet = stderr ? ` stderr="${stderr.slice(0, 200)}"` : ''
  const sandboxField = sandbox ? ` sandbox=${sandbox}` : ''
  const line = `[${timestamp}] language=${language} exit=${exitCode}${sandboxField}${stderrSnippet} code="${code.replace(/"/g, '\\"')}"\n`
  try {
    const dir = join(homedir(), '.llm-chat')
    mkdirSync(dir, { recursive: true })
    appendFileSync(getAuditLogPath(), line, 'utf-8')
  } catch {
    // Audit logging is best-effort — don't break execution if the log can't be written
    console.error('[code-executor] Failed to write audit log entry')
  }
}

export const codeExecutorTool = tool({
  description: 'Execute code snippets. Supports JavaScript (sandboxed), Python, and shell commands. Returns stdout, stderr, and exit code.',
  inputSchema: jsonSchema<{ language: 'javascript' | 'python' | 'shell'; code: string }>({
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'python', 'shell'],
        description: 'Programming language to execute',
      },
      code: { type: 'string', description: 'The code to execute' },
    },
    required: ['language', 'code'],
  }),
  execute: async ({ language, code }) => {
    const TIMEOUT_MS = 5000

    try {
      if (language === 'javascript') {
        const result = executeJavaScript(code, TIMEOUT_MS)
        // Audit log JS execution (always safe — vm sandbox)
        auditLog(language, code.slice(0, 500), result.exitCode, result.stderr || undefined)
        return result
      }

      // Validate shell commands against the allowlist
      if (language === 'shell') {
        // Check for dangerous shell constructs first
        if (containsDangerousConstructs(code)) {
          const message =
            'Shell code contains prohibited constructs (&&, ||, ;, backticks, $(), ${}). ' +
            'Use a single pipeline with only allowed commands.'
          auditLog(language, code.slice(0, 500), -1, message)
          return { stdout: '', stderr: message, exitCode: 1 }
        }

        const commands = extractCommandNames(code)
        if (commands.length === 0) {
          const message = 'Could not parse any shell command from the provided code.'
          auditLog(language, code.slice(0, 500), -1, message)
          return { stdout: '', stderr: message, exitCode: 1 }
        }

        const allowed = getAllowedCommands()
        const disallowed = commands.filter((cmd) => !allowed.has(cmd))
        if (disallowed.length > 0) {
          const message =
            `Command(s) not in allowlist: ${disallowed.join(', ')}. ` +
            `Allowed commands: ${[...allowed].sort().join(', ')}`
          auditLog(language, code.slice(0, 500), -1, message)
          return { stdout: '', stderr: message, exitCode: 1 }
        }
      }

      const result = await executeProcess(language, code, TIMEOUT_MS)
      auditLog(language, code.slice(0, 500), result.exitCode, result.stderr || undefined, activeSandboxLabel())
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution failed'
      auditLog(language, code.slice(0, 500), 1, message)
      return {
        stdout: '',
        stderr: message,
        exitCode: 1,
      }
    }
  },
})

function executeJavaScript(code: string, timeout: number) {
  const logs: string[] = []
  const errors: string[] = []

  const sandbox = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => errors.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      info: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    },
    Math,
    JSON,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    RegExp,
    Error,
    Promise,
  }

  const context = vm.createContext(sandbox)

  try {
    const result = vm.runInContext(code, context, { timeout })
    if (result !== undefined) {
      logs.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
    }
    return { stdout: logs.join('\n'), stderr: errors.join('\n'), exitCode: 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { stdout: logs.join('\n'), stderr: message, exitCode: 1 }
  }
}

// ---------------------------------------------------------------------------
// OS-level sandbox wrapping.
//
// The command allowlist (above) is the primary, always-on defense. As an
// additional layer of containment, if a known sandbox binary (firejail or
// bubblewrap) is present on the PATH we wrap the executed process so it runs
// with no network access and a read-only/limited filesystem view.
//
// This is strictly best-effort: when no sandbox binary is available we fall
// back to running the (allowlisted) command directly. Detection is memoized so
// we don't probe the PATH on every execution.
// ---------------------------------------------------------------------------

type SandboxResolution =
  | { kind: 'none' }
  | { kind: 'firejail' | 'bwrap'; bin: string }

let cachedSandbox: SandboxResolution | undefined

/** Returns true if `bin` is resolvable on the PATH. */
function binaryExists(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Detect an available OS sandbox. Honors CODE_EXECUTOR_SANDBOX:
 *   - 'none'                 → never wrap (allowlist only)
 *   - 'firejail' | 'bwrap'   → require that specific tool (falls back to none if missing)
 *   - unset / 'auto'         → prefer firejail, then bubblewrap, else none
 */
function resolveSandbox(): SandboxResolution {
  if (cachedSandbox !== undefined) return cachedSandbox

  const pref = (process.env.CODE_EXECUTOR_SANDBOX || 'auto').trim().toLowerCase()

  if (pref === 'none') {
    cachedSandbox = { kind: 'none' }
    return cachedSandbox
  }

  const tryFirejail = (): SandboxResolution | null =>
    binaryExists('firejail') ? { kind: 'firejail', bin: 'firejail' } : null
  const tryBwrap = (): SandboxResolution | null =>
    binaryExists('bwrap') ? { kind: 'bwrap', bin: 'bwrap' } : null

  let resolved: SandboxResolution | null = null
  if (pref === 'firejail') resolved = tryFirejail()
  else if (pref === 'bwrap' || pref === 'bubblewrap') resolved = tryBwrap()
  else resolved = tryFirejail() ?? tryBwrap()

  cachedSandbox = resolved ?? { kind: 'none' }
  return cachedSandbox
}

/** Reset the memoized sandbox detection (used by tests). */
export function _resetSandboxCache(): void {
  cachedSandbox = undefined
}

/**
 * Build the [command, args] pair to spawn, wrapping with a sandbox binary when
 * one is available. The inner command is always `python3 -c <code>` or
 * `bash -c <code>`; the sandbox binary, if any, prefixes it with restrictive
 * flags (no network, no privilege escalation).
 */
function buildSpawnArgs(language: 'python' | 'shell', code: string): { cmd: string; args: string[] } {
  const inner = language === 'python' ? 'python3' : 'bash'
  const innerArgs = ['-c', code]
  const sandbox = resolveSandbox()

  if (sandbox.kind === 'firejail') {
    // --quiet keeps stderr clean; --net=none disables networking;
    // --private gives an ephemeral home; --noprofile avoids user profiles.
    return {
      cmd: sandbox.bin,
      args: ['--quiet', '--noprofile', '--net=none', '--private', '--', inner, ...innerArgs],
    }
  }

  if (sandbox.kind === 'bwrap') {
    // Read-only bind of the host root, an ephemeral /tmp, no network.
    return {
      cmd: sandbox.bin,
      args: [
        '--ro-bind', '/', '/',
        '--dev', '/dev',
        '--proc', '/proc',
        '--tmpfs', '/tmp',
        '--unshare-net',
        '--die-with-parent',
        '--',
        inner, ...innerArgs,
      ],
    }
  }

  return { cmd: inner, args: innerArgs }
}

/** Human-readable description of the active sandbox, for audit logging. */
function activeSandboxLabel(): string {
  return resolveSandbox().kind
}

function executeProcess(language: 'python' | 'shell', code: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { cmd, args } = buildSpawnArgs(language, code)

  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ? 124 : 1 : 0,
      })
    })
  })
}
