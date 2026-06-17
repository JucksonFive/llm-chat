import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { logSecurityEvent } from './audit-log.js'

let tmpDir: string
const ORIGINAL_APP_DATA_DIR = process.env.APP_DATA_DIR
const ORIGINAL_ENABLED = process.env.AUDIT_LOG_ENABLED

function logPath() {
  return path.join(tmpDir, 'audit.log')
}

function readLines(): string[] {
  return readFileSync(logPath(), 'utf-8').trim().split('\n').filter(Boolean)
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'audit-test-'))
  process.env.APP_DATA_DIR = tmpDir
  delete process.env.AUDIT_LOG_ENABLED
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  if (ORIGINAL_APP_DATA_DIR === undefined) delete process.env.APP_DATA_DIR
  else process.env.APP_DATA_DIR = ORIGINAL_APP_DATA_DIR
  if (ORIGINAL_ENABLED === undefined) delete process.env.AUDIT_LOG_ENABLED
  else process.env.AUDIT_LOG_ENABLED = ORIGINAL_ENABLED
})

describe('logSecurityEvent', () => {
  it('writes events as JSON lines with timestamp, event, severity, details', () => {
    logSecurityEvent('api_key.set', { agentId: 'a1' })
    logSecurityEvent('file.read', { path: '/tmp/x', success: false }, 'warning')

    const lines = readLines()
    expect(lines).toHaveLength(2)

    const first = JSON.parse(lines[0])
    expect(first.event).toBe('api_key.set')
    expect(first.severity).toBe('info')
    expect(first.details).toEqual({ agentId: 'a1' })
    expect(typeof first.timestamp).toBe('string')
    expect(() => new Date(first.timestamp).toISOString()).not.toThrow()

    const second = JSON.parse(lines[1])
    expect(second.event).toBe('file.read')
    expect(second.severity).toBe('warning')
  })

  it('defaults details to an empty object', () => {
    logSecurityEvent('agent.deleted')
    const entry = JSON.parse(readLines()[0])
    expect(entry.details).toEqual({})
  })

  it('does nothing when AUDIT_LOG_ENABLED=false', () => {
    process.env.AUDIT_LOG_ENABLED = 'false'
    logSecurityEvent('api_key.set', { agentId: 'a1' })
    expect(existsSync(logPath())).toBe(false)
  })

  it('writes when AUDIT_LOG_ENABLED is unset (default enabled)', () => {
    logSecurityEvent('chat.request', { providerId: 'openai' })
    expect(existsSync(logPath())).toBe(true)
    expect(readLines()).toHaveLength(1)
  })

  it('rotates the log when it exceeds the size threshold', () => {
    // Pre-seed audit.log just over 10MB so the next write triggers rotation.
    writeFileSync(logPath(), 'x'.repeat(10 * 1024 * 1024 + 1), 'utf-8')

    logSecurityEvent('chat.request', { providerId: 'openai' })

    const rotated = `${logPath()}.1`
    expect(existsSync(rotated)).toBe(true)
    // The rotated file holds the old large content.
    expect(statSync(rotated).size).toBeGreaterThan(10 * 1024 * 1024)
    // The fresh log contains only the new event.
    expect(readLines()).toHaveLength(1)
    expect(JSON.parse(readLines()[0]).event).toBe('chat.request')
  })

  it('keeps at most 5 rotated files, dropping the oldest', () => {
    const base = logPath()
    // Create existing rotated files .1 .. .5 with identifiable content.
    for (let i = 1; i <= 5; i++) {
      writeFileSync(`${base}.${i}`, `rotated-${i}`, 'utf-8')
    }
    // Oversized current log triggers a rotation shift.
    writeFileSync(base, 'x'.repeat(10 * 1024 * 1024 + 1), 'utf-8')

    logSecurityEvent('chat.request', {})

    // .5 should now be the previous .4 content (oldest .5 dropped).
    expect(readFileSync(`${base}.5`, 'utf-8')).toBe('rotated-4')
    // .1 should be the previously-current oversized log.
    expect(statSync(`${base}.1`).size).toBeGreaterThan(10 * 1024 * 1024)
    // No .6 created.
    expect(existsSync(`${base}.6`)).toBe(false)
  })
})
