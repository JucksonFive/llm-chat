import { appendFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Workspace restrictions for file tools (file-reader, file-writer, pdf-reader).
 *
 * By default, file operations are confined to WORKSPACE_ROOT (default
 * `~/.llm-chat/workspace/`). This prevents a prompt-injected model from reading
 * sensitive files (`~/.ssh/id_rsa`, `~/.aws/credentials`, the encrypted DB) or
 * writing to persistence locations (`~/.bashrc`, autostart entries).
 *
 * Set `ALLOW_FULL_FS_ACCESS=true` to opt out of the workspace sandbox and allow
 * full filesystem access (default: off).
 */

/** Sensitive file names / patterns denied even when inside the workspace. */
const DENY_LIST: RegExp[] = [
  /^data\.db$/i,
  /^audit\.log$/i,
  /\.key$/i,
  /\.pem$/i,
]

/** Resolve the configured workspace root (absolute, normalized). */
export function getWorkspaceRoot(): string {
  const configured = process.env.WORKSPACE_ROOT
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.llm-chat', 'workspace')
  return path.resolve(root)
}

/** Whether the workspace sandbox is disabled via opt-in env flag. */
export function isFullFsAccessAllowed(): boolean {
  const v = process.env.ALLOW_FULL_FS_ACCESS
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * Resolve a (possibly relative) file path against the workspace root and ensure
 * the workspace root directory exists. When full filesystem access is enabled,
 * the path is resolved against the current working directory instead.
 *
 * Relative paths are interpreted as relative to the workspace root so the model
 * can refer to files by name (e.g. `notes.txt`).
 */
export function resolveWorkspace(filePath: string): string {
  if (isFullFsAccessAllowed()) {
    return path.resolve(filePath)
  }

  const root = getWorkspaceRoot()
  // Auto-create the workspace root on first use.
  try {
    mkdirSync(root, { recursive: true })
  } catch {
    // Best-effort — validation/IO will surface a clear error later.
  }

  // Absolute paths are honored as-is (then validated against the root);
  // relative paths are anchored to the workspace root.
  return path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath)
}

export interface WorkspaceAccessResult {
  /** True when access is permitted. */
  ok: boolean
  /** Human-readable error when access is denied. */
  error?: string
}

/**
 * Validate that a resolved absolute path is allowed for file operations.
 * Enforces the workspace boundary and the sensitive-name deny-list.
 */
export function validateWorkspaceAccess(resolved: string): WorkspaceAccessResult {
  // Deny-list applies regardless of full-access mode — these are always sensitive.
  const base = path.basename(resolved)
  if (DENY_LIST.some((re) => re.test(base))) {
    return { ok: false, error: `Access denied: "${base}" is a protected file` }
  }

  if (isFullFsAccessAllowed()) {
    return { ok: true }
  }

  const root = getWorkspaceRoot()
  const relative = path.relative(root, resolved)
  if (relative === '' ) {
    // The workspace root itself is a directory, not a file target — but allow it
    // to pass the boundary check; callers handle directory vs file separately.
    return { ok: true }
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      error: `Access denied: "${resolved}" is outside the workspace (${root})`,
    }
  }

  return { ok: true }
}

/**
 * Convenience helper: resolve + validate in one call.
 * Returns the resolved path on success or an error object on denial.
 *
 * When a workspaceRoot is provided (from a project's workspacePath), path
 * resolution uses that root instead of the global WORKSPACE_ROOT env var.
 * This is the preferred path for project-scoped file operations.
 */
export function prepareWorkspacePath(
  filePath: string,
  workspaceRoot?: string,
): { resolved: string } | { error: string } {
  const resolved = workspaceRoot
    ? resolveProjectPath(filePath, workspaceRoot)
    : resolveWorkspace(filePath)
  const access = workspaceRoot
    ? validateProjectAccess(resolved, workspaceRoot)
    : validateWorkspaceAccess(resolved)
  if (!access.ok) {
    return { error: access.error ?? 'Access denied' }
  }
  return { resolved }
}

/**
 * Resolve a file path against a project workspace root.
 * Relative paths are anchored to the workspace root.
 * Absolute paths are resolved as-is then validated against the boundary.
 */
export function resolveProjectPath(filePath: string, workspaceRoot: string): string {
  return path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workspaceRoot, filePath)
}

/**
 * Validate that a resolved path is within the project workspace boundary.
 * Same deny-list as global workspace validation, but scoped to the project
 * root instead of the global WORKSPACE_ROOT.
 */
export function validateProjectAccess(
  resolved: string,
  workspaceRoot: string,
): WorkspaceAccessResult {
  // Deny-list applies regardless — these are always sensitive.
  const base = path.basename(resolved)
  if (DENY_LIST.some((re) => re.test(base))) {
    return { ok: false, error: `Access denied: "${base}" is a protected file` }
  }

  const relative = path.relative(workspaceRoot, resolved)
  if (relative === '') {
    return { ok: true }
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      error: `Access denied: "${resolved}" is outside the project workspace (${workspaceRoot})`,
    }
  }

  return { ok: true }
}

/** Append-only audit log for file tool operations (best-effort). */
export function auditFileOperation(
  operation: 'read' | 'write' | 'append' | 'read-pdf',
  resolvedPath: string,
  outcome: 'ok' | 'denied' | 'error',
  detail?: string,
): void {
  const timestamp = new Date().toISOString()
  const detailSnippet = detail ? ` detail="${detail.slice(0, 200).replace(/"/g, '\\"')}"` : ''
  const line = `[${timestamp}] op=${operation} outcome=${outcome} path="${resolvedPath.replace(/"/g, '\\"')}"${detailSnippet}\n`
  try {
    const dir = path.join(os.homedir(), '.llm-chat')
    mkdirSync(dir, { recursive: true })
    appendFileSync(path.join(dir, 'audit.log'), line, 'utf-8')
  } catch {
    // Best-effort — never break file operations on audit failure.
    console.error('[workspace] Failed to write audit log entry')
  }
}
