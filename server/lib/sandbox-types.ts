/**
 * Core sandbox execution types.
 *
 * These define the contract between sandbox drivers (WSL bubblewrap, Windows
 * restricted-token helper) and the rest of the system. All sandbox drivers
 * implement the SandboxDriver interface.
 */

/** Supported PowerShell runtimes. */
export type SandboxRuntime = 'windows-powershell' | 'wsl-pwsh'

/** Sandbox implementation kind (used in audit logs and status reporting). */
export type SandboxKind =
  | 'windows-elevated'
  | 'windows-restricted'
  | 'wsl-bwrap'
  | 'none'

/** Resources the execution is allowed to access. */
export interface SandboxResources {
  /** If true, network access is allowed (default: false). */
  network?: boolean
  /** Additional paths the process may read (must still be within workspace). */
  readPaths?: string[]
  /** Additional paths the process may write (must still be within workspace). */
  writePaths?: string[]
}

/** Request to execute a script in the sandbox. */
export interface SandboxExecutionRequest {
  /** Project ID (workspace path is loaded from DB, never from this request). */
  projectId: string
  /** Which PowerShell runtime to use. */
  runtime: SandboxRuntime
  /** The PowerShell script content. */
  script: string
  /** Working directory relative to workspace root (optional). */
  cwd?: string
  /** Execution timeout in seconds (default: 120, max: 900). */
  timeoutSeconds?: number
  /** Allowed resources (defaults: no network, workspace-only). */
  resources?: SandboxResources
}

/** Result of a sandbox execution. */
export interface SandboxExecutionResult {
  /** Captured stdout (max 1 MiB). */
  stdout: string
  /** Captured stderr (max 1 MiB). */
  stderr: string
  /** Process exit code. */
  exitCode: number
  /** Whether the process was killed due to timeout. */
  timedOut: boolean
  /** Which sandbox implementation handled the execution. */
  sandbox: SandboxKind
  /** The runtime used. */
  runtime: SandboxRuntime
  /** Wall-clock duration in milliseconds. */
  durationMs: number
}

/** Project workspace info loaded from DB (canonical paths only). */
export interface ProjectWorkspace {
  projectId: string
  workspacePath: string
  workspaceKind: string
  preferredRuntime: string
}

/**
 * Abstraction for a sandbox driver.
 *
 * Each driver (WSL bubblewrap, Windows restricted token, etc.) implements
 * this interface. Drivers are responsible for all OS-level isolation:
 * filesystem boundaries, network restrictions, process tree management,
 * and environment sanitization.
 */
export interface SandboxDriver {
  /** Human-readable identifier for audit logging. */
  readonly kind: SandboxKind

  /** Check if this driver is available on the current system. */
  isAvailable(): Promise<boolean>

  /**
   * Execute a script in the sandbox.
   *
   * The driver is responsible for:
   * - Canonicalizing the workspace path
   * - Building the sandbox command (bwrap, restricted process, etc.)
   * - Piping the script to pwsh stdin
   * - Enforcing the timeout
   * - Capturing and limiting stdout/stderr
   * - Stripping secrets from child process environment
   * - Cleaning up on exit or timeout
   */
  execute(
    req: SandboxExecutionRequest,
    workspace: ProjectWorkspace,
  ): Promise<SandboxExecutionResult>

  /**
   * Canonicalize a workspace path for this runtime.
   * May translate between Windows and WSL path conventions.
   */
  canonicalizePath(workspacePath: string): string
}
