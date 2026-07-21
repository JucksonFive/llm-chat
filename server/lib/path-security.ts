/**
 * Path canonicalization, boundary validation, and escape detection for
 * sandbox workspace paths.
 *
 * All workspace paths used by sandbox drivers and file tools must pass
 * through these checks. None of these functions should trust a path from
 * a request body without first validating it against the workspace root
 * loaded from the database.
 */

import { realpathSync, existsSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Sensitive path patterns — denied even when inside the workspace.
// ---------------------------------------------------------------------------

const DENY_PATTERNS: RegExp[] = [
  /\.git(\/|$)/i,
  /\.codex(\/|$)/i,
  /\.agents(\/|$)/i,
  /\.env/i,
  /data\.db$/i,
  /audit\.log$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials/i,
  /\.aws(\/|$)/i,
  /\.ssh(\/|$)/i,
  /\.gnupg(\/|$)/i,
]

// Windows junction / mount point prefixes to reject.
const WINDOWS_JUNCTION_PATHS = [
  /^\\\\[^?]/,   // UNC paths (\\server\share) — not \\?\ (extended-length)
  /^[A-Z]:\\\\(?![?])/, // Device paths like \\.\PhysicalDrive
]

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Resolve symlinks and normalize a path to its canonical form.
 * Returns null if the path doesn't exist or can't be resolved.
 */
export function canonicalizePath(inputPath: string): string | null {
  try {
    if (!existsSync(inputPath)) {
      // For paths that don't exist yet (e.g., new file writes), normalize
      // without resolving symlinks.
      return path.resolve(inputPath)
    }
    return realpathSync(inputPath)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Workspace boundary validation
// ---------------------------------------------------------------------------

/**
 * Result of workspace boundary validation.
 */
export type BoundaryResult =
  | { ok: true; canonical: string }
  | { ok: false; error: string }

/**
 * Validate that a requested path is within the workspace root.
 *
 * Checks:
 * - Path is absolute after resolution
 * - No `..` traversal outside workspace
 * - No symlink escapes pointing outside workspace
 * - Sensitive paths are denied
 *
 * @param requestedPath - The path to validate (may be relative or absolute)
 * @param workspaceRoot - The canonical workspace root from the database
 * @param allowMissing - If true, don't require the path to exist on disk
 */
export function validateWorkspaceBoundary(
  requestedPath: string,
  workspaceRoot: string,
  allowMissing = false,
): BoundaryResult {
  // Resolve to absolute
  const absolute = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(workspaceRoot, requestedPath)

  // Check for Windows junction/UNC escapes
  if (process.platform === 'win32') {
    for (const pattern of WINDOWS_JUNCTION_PATHS) {
      if (pattern.test(absolute)) {
        return {
          ok: false,
          error: `Path uses a disallowed Windows device or UNC form: ${requestedPath}`,
        }
      }
    }
  }

  // Canonicalize (resolve symlinks)
  const canonical = allowMissing
    ? absolute
    : canonicalizePath(absolute)
  if (canonical === null && !allowMissing) {
    return { ok: false, error: `Path does not exist: ${requestedPath}` }
  }

  const resolved = canonical ?? absolute

  // Check workspace boundary
  const relative = path.relative(workspaceRoot, resolved)
  if (relative === '') {
    // The workspace root itself — allow traversal boundary check to pass
    // but callers should handle directory vs file separately.
    return { ok: true, canonical: resolved }
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      error: `Path is outside the workspace: ${requestedPath}`,
    }
  }

  // Check denylist
  const denyResult = checkSensitivePaths(resolved)
  if (denyResult) {
    return { ok: false, error: denyResult }
  }

  return { ok: true, canonical: resolved }
}

/**
 * Check if any segment of the path matches a sensitive/protected pattern.
 * Returns an error message if denied, undefined if allowed.
 */
export function checkSensitivePaths(resolvedPath: string): string | undefined {
  // Check the full path and each segment
  const normalized = resolvedPath.replace(/\\/g, '/')
  const segments = normalized.split('/')

  for (const segment of segments) {
    if (!segment) continue
    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(segment)) {
        return `Access denied: "${segment}" matches a protected path pattern`
      }
    }
  }

  // Also check the full normalized path
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(normalized)) {
      return `Access denied: path matches a protected pattern`
    }
  }

  return undefined
}

/**
 * Simple check: is childPath within parentPath?
 * Uses string prefix comparison after normalization (faster than path.relative
 * for quick checks in hot paths).
 */
export function isWithinWorkspace(childPath: string, workspaceRoot: string): boolean {
  const result = validateWorkspaceBoundary(childPath, workspaceRoot, true)
  return result.ok
}

// ---------------------------------------------------------------------------
// WSL ↔ Windows path translation
// ---------------------------------------------------------------------------

/**
 * Translate a Windows path to its WSL equivalent.
 *
 * C:\Users\x\code → /mnt/c/Users/x/code
 * \\wsl$\Ubuntu\home\x → /home/x
 */
export function translateWindowsToWsl(windowsPath: string): string {
  // Handle \\wsl$\<distro>\... paths
  const wslMatch = windowsPath.match(/^\\\\wsl\$\\([^\\]+)\\(.*)$/i)
  if (wslMatch) {
    return `/${wslMatch[2].replace(/\\/g, '/')}`
  }

  // Handle C:\... paths
  const driveMatch = windowsPath.match(/^([A-Z]):\\(.*)$/i)
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase()
    const rest = driveMatch[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`
  }

  // Already a Unix path — return as-is
  return windowsPath.replace(/\\/g, '/')
}

/**
 * Translate a WSL path to its Windows equivalent.
 *
 * /mnt/c/Users/x/code → C:\Users\x\code
 * /home/x/code → \\wsl$\<distro>\home\x\code (requires distro name)
 */
export function translateWslToWindows(wslPath: string, distro?: string): string {
  // Handle /mnt/<drive>/... paths
  const mntMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/i)
  if (mntMatch) {
    const drive = mntMatch[1].toUpperCase()
    const rest = mntMatch[2].replace(/\//g, '\\')
    return `${drive}:\\${rest}`
  }

  // Handle regular WSL paths — need distro name for \\wsl$\ mapping
  if (distro) {
    const rest = wslPath.replace(/\//g, '\\')
    return `\\\\wsl$\\${distro}${rest}`
  }

  // Fallback: return as-is (caller should provide distro)
  return wslPath
}

/**
 * Resolve the runtime-appropriate canonical path.
 *
 * When the workspace is on WSL but the runtime is Windows PowerShell (or
 * vice versa), this translates the path appropriately.
 */
export function resolveRuntimePath(
  workspacePath: string,
  workspaceKind: string,
  preferredRuntime: string,
): string {
  // If workspace and runtime match, no translation needed
  if (
    (workspaceKind === 'wsl' && preferredRuntime === 'wsl-pwsh') ||
    (workspaceKind === 'windows' && preferredRuntime === 'windows-powershell')
  ) {
    return workspacePath
  }

  // Cross-runtime translation
  if (preferredRuntime === 'wsl-pwsh' && workspaceKind === 'windows') {
    return translateWindowsToWsl(workspacePath)
  }
  if (preferredRuntime === 'windows-powershell' && workspaceKind === 'wsl') {
    return translateWslToWindows(workspacePath)
  }

  return workspacePath
}
