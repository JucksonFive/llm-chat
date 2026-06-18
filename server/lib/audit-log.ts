import { appendFileSync, mkdirSync, renameSync, statSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Security audit logging.
 *
 * Writes one JSON object per line to `<base>/audit.log`. The base directory
 * defaults to `~/.llm-chat` but can be overridden with the `APP_DATA_DIR`
 * env var (kept consistent with the rest of the server) — this is primarily
 * used to keep tests away from the real data directory.
 *
 * Logging can be disabled entirely with `AUDIT_LOG_ENABLED=false`.
 *
 * IMPORTANT: callers must never pass raw API keys, passwords, or full message
 * content in `details`. This module makes no attempt to scrub such values.
 */

export type AuditSeverity = 'info' | 'warning' | 'error'

export interface AuditEvent {
  timestamp: string
  event: string
  severity: AuditSeverity
  details: Record<string, unknown>
}

const MAX_LOG_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_ROTATED_FILES = 5 // keep audit.log.1 .. audit.log.5

function isEnabled(): boolean {
  return process.env.AUDIT_LOG_ENABLED !== 'false'
}

function getBaseDir(): string {
  return process.env.APP_DATA_DIR || path.join(homedir(), '.llm-chat')
}

function getLogPath(): string {
  return path.join(getBaseDir(), 'audit.log')
}

/**
 * Size-based rotation. When `audit.log` exceeds the threshold, shift the
 * rotated files (audit.log.4 -> audit.log.5, dropping the oldest) and move
 * the current log to audit.log.1.
 */
function rotateIfNeeded(logPath: string): void {
  let size: number
  try {
    size = statSync(logPath).size
  } catch {
    return // no file yet, nothing to rotate
  }

  if (size < MAX_LOG_BYTES) return

  // Drop the oldest rotated file if present.
  const oldest = `${logPath}.${MAX_ROTATED_FILES}`
  if (existsSync(oldest)) {
    try {
      unlinkSync(oldest)
    } catch {
      /* best effort */
    }
  }

  // Shift audit.log.(n) -> audit.log.(n+1) from oldest to newest.
  for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
    const src = `${logPath}.${i}`
    if (existsSync(src)) {
      try {
        renameSync(src, `${logPath}.${i + 1}`)
      } catch {
        /* best effort */
      }
    }
  }

  // Move current log to audit.log.1.
  try {
    renameSync(logPath, `${logPath}.1`)
  } catch {
    /* best effort */
  }
}

/**
 * Append a security-relevant event to the audit log.
 *
 * Best-effort: failures to write are logged to the console but never thrown,
 * so audit logging can never break a request.
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown> = {},
  severity: AuditSeverity = 'info',
): void {
  if (!isEnabled()) return

  const entry: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    severity,
    details,
  }

  const line = JSON.stringify(entry) + '\n'

  try {
    const dir = getBaseDir()
    mkdirSync(dir, { recursive: true })
    const logPath = getLogPath()
    rotateIfNeeded(logPath)
    appendFileSync(logPath, line, 'utf-8')
  } catch {
    // Audit logging is best-effort — never break the caller.
    console.error(`[audit-log] Failed to write security event "${event}"`)
  }
}
