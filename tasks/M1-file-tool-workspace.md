# M1 — Add Workspace Restrictions to File Tools

**Severity:** Medium  
**CVSS:** 5.5 (AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)  
**Status:** Open  
**Files:** `server/tools/file-reader.ts`, `server/tools/file-writer.ts`, `server/tools/pdf-reader.ts`  

## Problem

The file tools accept any absolute path. While `path.resolve()` prevents `../` traversal, it doesn't restrict which files can be accessed. A prompt-injected model could read:
- `~/.ssh/id_rsa`
- `~/.aws/credentials`
- `~/.llm-chat/data.db` (the encrypted database)
- `/etc/passwd`

Or write to:
- `~/.bashrc` (persistence)
- `~/.config/autostart/` (autostart entries)

## Acceptance criteria

- [ ] Add a `WORKSPACE_ROOT` env var (default: `~/.llm-chat/workspace/`)
- [ ] All file operations validate that the resolved path is within `WORKSPACE_ROOT`:
  ```ts
  const relative = path.relative(WORKSPACE_ROOT, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: `Access denied: "${filePath}" is outside the workspace (${WORKSPACE_ROOT})` }
  }
  ```
- [ ] A separate deny-list prevents access to sensitive paths even within the workspace:
  - `data.db`, `audit.log`, `*.key`, `*.pem`
- [ ] UI setting toggle: "Allow full filesystem access" (default: off, requires explicit user opt-in)
- [ ] Audit log records every file read/write with path and operation
- [ ] Tests: verify workspace boundary enforcement and deny-list filtering

## Implementation notes

- Create `server/lib/workspace.ts` with `resolveWorkspace(filePath): string` and `validateWorkspaceAccess(resolved): boolean`
- Reuse in all three tools
- The workspace root should be created automatically on first use
