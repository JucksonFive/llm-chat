# M4 — Add Security Audit Logging

**Severity:** Medium  
**CVSS:** 3.0 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L)  
**Status:** Open  
**Files:** Multiple — `server/index.ts`, `server/db-routes.ts`, `server/tools/*.ts`  

## Problem

No security-relevant events are logged. Without an audit trail, it's impossible to:
- Investigate suspicious activity
- Determine what commands were executed by the code-executor
- Know which files were read or written by the file tools
- Track who modified API keys and when

## Acceptance criteria

- [ ] Create `server/lib/audit-log.ts` with a `logSecurityEvent(event)` function
- [ ] Log these events (at minimum):
  - API key set / cleared (agent ID, timestamp) — never log the key value
  - Agent created / deleted
  - File read / write (path, size, operation, success/failure)
  - Shell command execution (command, exit code, duration)
  - MCP server added / removed / connected
  - Chat request (provider, model, tool count, message count)
  - Rate limit exceeded
- [ ] Log format: one JSON object per line, written to `~/.llm-chat/audit.log`
- [ ] Log rotation: max 10MB, keep 5 rotated files
- [ ] Configurable via `AUDIT_LOG_ENABLED` env var (default: true)
- [ ] Tests: unit tests for the audit logger; verify events are written

## Implementation notes

```ts
// server/lib/audit-log.ts
interface AuditEvent {
  timestamp: string
  event: string
  severity: 'info' | 'warning' | 'error'
  details: Record<string, unknown>
}

export function logSecurityEvent(event: string, details: Record<string, unknown>, severity = 'info') {
  if (process.env.AUDIT_LOG_ENABLED === 'false') return
  const entry: AuditEvent = { timestamp: new Date().toISOString(), event, severity, details }
  const line = JSON.stringify(entry) + '\n'
  // Append to file
}
```

- Use `fs.appendFileSync` for simplicity (only security events, low volume)
- Never log raw API keys, passwords, or full message content
