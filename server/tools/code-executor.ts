import { tool, jsonSchema } from 'ai'
import vm from 'node:vm'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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

function auditLog(language: string, code: string, exitCode: number, stderr?: string): void {
  const timestamp = new Date().toISOString()
  const stderrSnippet = stderr ? ` stderr="${stderr.slice(0, 200)}"` : ''
  const line = `[${timestamp}] language=${language} exit=${exitCode}${stderrSnippet} code="${code.replace(/"/g, '\\"')}"\n`
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
      auditLog(language, code.slice(0, 500), result.exitCode, result.stderr || undefined)
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

function executeProcess(language: 'python' | 'shell', code: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cmd = language === 'python' ? 'python3' : 'bash'
  const args = ['-c', code]

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
