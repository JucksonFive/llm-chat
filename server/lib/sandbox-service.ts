/**
 * Unified sandbox execution service.
 *
 * This is the main entry point for sandboxed PowerShell execution. It:
 * 1. Loads the project workspace from the database (canonical path only)
 * 2. Selects the appropriate driver (WSL or Windows)
 * 3. Applies defaults and limits (timeout, output size)
 * 4. Delegates to the driver for actual execution
 *
 * The service NEVER trusts a workspace path from the request body — it
 * always queries the database for the canonical path.
 */

import { queryOne } from '../db.js'
import { logSecurityEvent } from './audit-log.js'
import type {
  SandboxDriver,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  ProjectWorkspace,
} from './sandbox-types.js'

// ---------------------------------------------------------------------------
// Defaults and limits
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_SECONDS = 120
const MAX_TIMEOUT_SECONDS = 900
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024 // 1 MiB

// ---------------------------------------------------------------------------
// Driver registry
// ---------------------------------------------------------------------------

const driverRegistry = new Map<string, SandboxDriver>()

/** Register a sandbox driver for a specific runtime. */
export function registerSandboxDriver(runtime: string, driver: SandboxDriver): void {
  driverRegistry.set(runtime, driver)
}

/** Look up a registered driver. */
export function getDriver(runtime: string): SandboxDriver | undefined {
  return driverRegistry.get(runtime)
}

/** List all registered drivers with their availability. */
export async function getDriverStatus(): Promise<
  { runtime: string; kind: string; available: boolean }[]
> {
  const statuses: { runtime: string; kind: string; available: boolean }[] = []
  for (const [runtime, driver] of driverRegistry) {
    statuses.push({
      runtime,
      kind: driver.kind,
      available: await driver.isAvailable(),
    })
  }
  return statuses
}

// ---------------------------------------------------------------------------
// Workspace loading
// ---------------------------------------------------------------------------

/**
 * Load the project workspace from the database.
 * Returns null if the project doesn't exist or has no workspace configured.
 */
export function loadProjectWorkspace(projectId: string): ProjectWorkspace | null {
  const row = queryOne<{
    id: string
    workspace_path: string
    workspace_kind: string
    preferred_runtime: string
  }>(
    'SELECT id, workspace_path, workspace_kind, preferred_runtime FROM projects WHERE id = $id',
    { id: projectId },
  )

  if (!row) return null
  if (!row.workspace_path) return null

  return {
    projectId: row.id,
    workspacePath: row.workspace_path,
    workspaceKind: row.workspace_kind || '',
    preferredRuntime: row.preferred_runtime || '',
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute a script in the sandbox for the given project.
 *
 * The workspace path is loaded from the database — it is NEVER taken from
 * the request. If the project has no workspace configured, an error is
 * returned.
 */
export async function executeInSandbox(
  req: SandboxExecutionRequest,
): Promise<SandboxExecutionResult> {
  const startTime = Date.now()

  // Load workspace from DB (never trust request)
  const workspace = loadProjectWorkspace(req.projectId)
  if (!workspace) {
    logSecurityEvent('sandbox.execute', {
      projectId: req.projectId,
      success: false,
      error: 'No workspace configured for project',
    }, 'warning')
    return {
      stdout: '',
      stderr: 'No workspace configured for this project. Select a workspace folder in project settings.',
      exitCode: 1,
      timedOut: false,
      sandbox: 'none',
      runtime: req.runtime,
      durationMs: Date.now() - startTime,
    }
  }

  // Resolve driver
  const runtime = workspace.preferredRuntime || req.runtime
  let driver = getDriver(runtime)
  if (!driver) {
    // Fallback: try the request runtime
    driver = getDriver(req.runtime)
  }
  if (!driver) {
    logSecurityEvent('sandbox.execute', {
      projectId: req.projectId,
      runtime,
      success: false,
      error: 'No sandbox driver available',
    }, 'warning')
    return {
      stdout: '',
      stderr: `No sandbox driver available for runtime: ${runtime}. Check sandbox prerequisites.`,
      exitCode: 1,
      timedOut: false,
      sandbox: 'none',
      runtime: req.runtime,
      durationMs: Date.now() - startTime,
    }
  }

  // Check driver availability
  const available = await driver.isAvailable()
  if (!available) {
    logSecurityEvent('sandbox.execute', {
      projectId: req.projectId,
      runtime,
      sandboxKind: driver.kind,
      success: false,
      error: 'Sandbox driver not available',
    }, 'warning')
    return {
      stdout: '',
      stderr: `Sandbox driver "${driver.kind}" is not available on this system. Check prerequisites or try a different runtime.`,
      exitCode: 1,
      timedOut: false,
      sandbox: driver.kind,
      runtime: req.runtime,
      durationMs: Date.now() - startTime,
    }
  }

  // Apply timeout defaults
  const timeoutSeconds = Math.min(
    Math.max(req.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, 1),
    MAX_TIMEOUT_SECONDS,
  )

  const executionReq: SandboxExecutionRequest = {
    ...req,
    timeoutSeconds,
  }

  try {
    const result = await driver.execute(executionReq, workspace)

    // Truncate output to max size
    const truncatedResult: SandboxExecutionResult = {
      ...result,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
      runtime: req.runtime,
    }

    logSecurityEvent('sandbox.execute', {
      projectId: req.projectId,
      runtime: req.runtime,
      sandboxKind: result.sandbox,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      networkAllowed: req.resources?.network ?? false,
      success: result.exitCode === 0 && !result.timedOut,
    })

    return truncatedResult
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox execution failed'
    logSecurityEvent('sandbox.execute', {
      projectId: req.projectId,
      runtime: req.runtime,
      sandboxKind: driver.kind,
      success: false,
      error: message,
    }, 'error')
    return {
      stdout: '',
      stderr: `Sandbox execution error: ${message}`,
      exitCode: 1,
      timedOut: false,
      sandbox: driver.kind,
      runtime: req.runtime,
      durationMs: Date.now() - startTime,
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateOutput(output: string): string {
  const buf = Buffer.from(output, 'utf-8')
  if (buf.length <= MAX_OUTPUT_BYTES) return output
  const truncated = Buffer.alloc(MAX_OUTPUT_BYTES)
  buf.copy(truncated, 0, 0, MAX_OUTPUT_BYTES)
  return truncated.toString('utf-8') + '\n\n[Output truncated at 1 MiB]'
}
