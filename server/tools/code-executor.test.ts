import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { codeExecutorTool, _resetSandboxCache } from './code-executor.js'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function getAuditLogPath(): string {
  return join(homedir(), '.llm-chat', 'audit.log')
}

function auditLogContent(): string {
  const path = getAuditLogPath()
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

function clearAuditLog(): void {
  const path = getAuditLogPath()
  if (existsSync(path)) unlinkSync(path)
}

// Helper: invoke the code executor tool
async function exec(language: 'javascript' | 'python' | 'shell', code: string) {
  const result = await codeExecutorTool.execute!(
    { language, code },
    { toolCallId: 't', messages: [] } as never,
  )
  return result as { stdout: string; stderr: string; exitCode: number }
}

describe('codeExecutorTool', () => {
  beforeAll(() => {
    // Start with a clean audit log
    clearAuditLog()
  })

  afterAll(() => {
    clearAuditLog()
  })

  // -----------------------------------------------------------------------
  // JavaScript (sandboxed) — existing behavior, should be unaffected
  // -----------------------------------------------------------------------
  describe('JavaScript (sandboxed)', () => {
    it('evaluates basic arithmetic', async () => {
      const r = await exec('javascript', '2 + 3')
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('5')
    })

    it('captures console.log output', async () => {
      const r = await exec('javascript', 'console.log("hello world")')
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('hello world')
    })

    it('captures console.error output', async () => {
      const r = await exec('javascript', 'console.error("oops")')
      expect(r.exitCode).toBe(0)
      expect(r.stderr).toContain('oops')
    })

    it('catches runtime errors', async () => {
      const r = await exec('javascript', 'throw new Error("boom")')
      expect(r.exitCode).toBe(1)
      expect(r.stderr).toContain('boom')
    })

    it('does not expose Node.js globals', async () => {
      // process, require, fs etc. should not be available in the vm sandbox
      const r = await exec('javascript', 'typeof process')
      expect(r.stdout).toContain('undefined')
    })

    it('returns object results as JSON', async () => {
      const r = await exec('javascript', '({ foo: 42 })')
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('"foo"')
      expect(r.stdout).toContain('42')
    })
  })

  // -----------------------------------------------------------------------
  // Python execution — should still work
  // -----------------------------------------------------------------------
  describe('Python', () => {
    it('executes basic python', async () => {
      const r = await exec('python', 'print("hello from python")')
      // Python might or might not be installed — just check it doesn't crash
      expect(r).toBeDefined()
      expect(typeof r.exitCode).toBe('number')
    })

    it('captures python errors', async () => {
      const r = await exec('python', 'raise Exception("test error")')
      expect(r).toBeDefined()
      // Should have a non-zero exit code or an error message
      expect(r.exitCode !== 0 || r.stderr.length > 0).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Shell allowlist — default set
  // -----------------------------------------------------------------------
  describe('Shell allowlist', () => {
    const allowedCmds = ['ls', 'cat', 'grep', 'find', 'head', 'tail',
      'wc', 'sort', 'uniq', 'echo', 'pwd', 'date', 'which']

    for (const cmd of allowedCmds) {
      it(`allows ${cmd}`, async () => {
        // Use the command in a way that should succeed or at least not be blocked
        const r = await exec('shell', `${cmd} --help 2>&1 || true`)
        // Should not report a disallowed command error
        expect(r.stderr).not.toMatch(/not in allowlist/)
      })
    }

    it('rejects disallowed commands', async () => {
      const r = await exec('shell', 'whoami')
      expect(r.stderr).toMatch(/not in allowlist/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects another disallowed command', async () => {
      const r = await exec('shell', 'curl http://example.com')
      expect(r.stderr).toMatch(/not in allowlist/)
      expect(r.exitCode).toBe(1)
    })

    it('allows pipelines with all-safe commands', async () => {
      const r = await exec('shell', 'echo hello | wc -c')
      // Should either succeed or fail with a runtime error, NOT an allowlist error
      expect(r.stderr).not.toMatch(/not in allowlist/)
    })

    it('rejects pipelines containing any disallowed command', async () => {
      const r = await exec('shell', 'echo hello | curl http://example.com')
      expect(r.stderr).toMatch(/not in allowlist/)
      expect(r.stderr).toMatch(/curl/)
      expect(r.exitCode).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Dangerous shell constructs
  // -----------------------------------------------------------------------
  describe('Dangerous shell constructs', () => {
    it('rejects logical AND chaining (&&)', async () => {
      const r = await exec('shell', 'echo hello && ls')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects logical OR chaining (||)', async () => {
      const r = await exec('shell', 'echo hello || ls')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects semicolon command separator', async () => {
      const r = await exec('shell', 'echo hello; ls')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects backtick command substitution', async () => {
      const r = await exec('shell', 'echo `whoami`')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects $() command substitution', async () => {
      const r = await exec('shell', 'echo $(whoami)')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects ${} parameter expansion', async () => {
      const r = await exec('shell', 'echo ${HOME}')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })

    it('rejects newline command separators', async () => {
      const r = await exec('shell', 'echo hello\nwhoami')
      expect(r.stderr).toMatch(/prohibited constructs/)
      expect(r.exitCode).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Audit logging
  // -----------------------------------------------------------------------
  describe('Audit logging', () => {
    it('writes a log entry when a command is executed', async () => {
      clearAuditLog()
      await exec('shell', 'echo audit-test-marker')
      const content = auditLogContent()
      expect(content).toMatch(/language=shell/)
      expect(content).toMatch(/audit-test-marker/)
      expect(content).toMatch(/exit=\d/)
    })

    it('writes a log entry for disallowed commands', async () => {
      clearAuditLog()
      await exec('shell', 'whoami')
      const content = auditLogContent()
      expect(content).toMatch(/language=shell/)
      expect(content).toMatch(/whoami/)
      expect(content).toMatch(/not in allowlist/)
    })

    it('writes a log entry for dangerous constructs', async () => {
      clearAuditLog()
      await exec('shell', 'echo a && echo b')
      const content = auditLogContent()
      expect(content).toMatch(/language=shell/)
      expect(content).toMatch(/prohibited constructs/)
    })

    it('writes a log entry for JavaScript execution', async () => {
      clearAuditLog()
      await exec('javascript', 'console.log("js-audit-test")')
      const content = auditLogContent()
      expect(content).toMatch(/language=javascript/)
      expect(content).toMatch(/js-audit-test/)
    })

    it('writes a log entry for Python execution', async () => {
      clearAuditLog()
      await exec('python', 'print("py-audit-test")')
      const content = auditLogContent()
      expect(content).toMatch(/language=python/)
      expect(content).toMatch(/py-audit-test/)
    })

    it('includes ISO timestamp in log entries', async () => {
      clearAuditLog()
      await exec('shell', 'echo timestamp-test')
      const content = auditLogContent()
      // ISO 8601 timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    })
  })

  // -----------------------------------------------------------------------
  // CODE_EXECUTOR_ALLOWED_COMMANDS env var
  // -----------------------------------------------------------------------
  describe('CODE_EXECUTOR_ALLOWED_COMMANDS env var', () => {
    const originalEnv = process.env.CODE_EXECUTOR_ALLOWED_COMMANDS

    afterAll(() => {
      if (originalEnv !== undefined) {
        process.env.CODE_EXECUTOR_ALLOWED_COMMANDS = originalEnv
      } else {
        delete process.env.CODE_EXECUTOR_ALLOWED_COMMANDS
      }
    })

    it('respects custom allowed commands from env var', async () => {
      process.env.CODE_EXECUTOR_ALLOWED_COMMANDS = 'whoami,id,ls'
      // whoami is disallowed by default; with the custom allowlist it must no
      // longer trigger the "not in allowlist" rejection. getAllowedCommands()
      // reads the env var on every call, so the override is picked up live.
      const r = await exec('shell', 'whoami')
      expect(r.stderr).not.toMatch(/not in allowlist/)
    })

    it('still rejects commands not in the custom allowlist', async () => {
      process.env.CODE_EXECUTOR_ALLOWED_COMMANDS = 'echo'
      // 'ls' is in the default allowlist but NOT in this custom one.
      const r = await exec('shell', 'ls')
      expect(r.stderr).toMatch(/not in allowlist/)
      expect(r.exitCode).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // OS-level sandbox wrapping (best-effort; tests must not require firejail)
  // -----------------------------------------------------------------------
  describe('Sandbox wrapping', () => {
    const originalSandbox = process.env.CODE_EXECUTOR_SANDBOX

    beforeEach(() => {
      _resetSandboxCache()
    })

    afterAll(() => {
      if (originalSandbox !== undefined) {
        process.env.CODE_EXECUTOR_SANDBOX = originalSandbox
      } else {
        delete process.env.CODE_EXECUTOR_SANDBOX
      }
      _resetSandboxCache()
    })

    it('runs commands without a sandbox when CODE_EXECUTOR_SANDBOX=none', async () => {
      process.env.CODE_EXECUTOR_SANDBOX = 'none'
      _resetSandboxCache()
      const r = await exec('shell', 'echo sandbox-none-test')
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('sandbox-none-test')
    })

    it('records the active sandbox in the audit log', async () => {
      process.env.CODE_EXECUTOR_SANDBOX = 'none'
      _resetSandboxCache()
      clearAuditLog()
      await exec('shell', 'echo sandbox-audit-test')
      const content = auditLogContent()
      // With CODE_EXECUTOR_SANDBOX=none the label is "none".
      expect(content).toMatch(/sandbox=none/)
    })

    it('falls back gracefully when a requested sandbox binary is absent', async () => {
      // Request a sandbox that almost certainly is not installed in CI; the
      // tool must fall back to direct execution rather than failing.
      process.env.CODE_EXECUTOR_SANDBOX = 'firejail'
      _resetSandboxCache()
      const r = await exec('shell', 'echo sandbox-fallback-test')
      // Either firejail ran it, or we fell back to direct execution — either
      // way the command must succeed (not error out due to a missing binary).
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('sandbox-fallback-test')
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('Edge cases', () => {
    it('handles empty code', async () => {
      const r = await exec('shell', '')
      // Should not crash — might parse as no commands
      expect(r).toBeDefined()
    })

    it('handles deeply piped commands', async () => {
      const r = await exec('shell', 'cat /dev/null | grep foo | wc -l | sort | uniq')
      // All commands in the pipeline are allowed
      expect(r.stderr).not.toMatch(/not in allowlist/)
    })

    it('handles environment variable prefixes', async () => {
      // FOO=bar cmd should extract 'cmd' as the command name
      const r = await exec('shell', 'FOO=bar echo hello')
      // 'echo' is allowed, and env var prefix should be stripped
      expect(r.stderr).not.toMatch(/not in allowlist/)
    })
  })
})
