/**
 * Windows Native Sandbox Driver (stub).
 *
 * Full implementation requires a Rust helper binary based on Codex's
 * windows-sandbox-rs (Apache 2.0). See rust-sandbox/ directory for the
 * Rust crate and Phase 10 of the implementation plan.
 *
 * Until the Rust helper is built and bundled, this driver returns
 * "not available" and the WSL driver is used as the fallback on Windows
 * via WSL2.
 */

import type {
  SandboxDriver,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  ProjectWorkspace,
} from '../lib/sandbox-types.js'

export class WindowsSandboxDriver implements SandboxDriver {
  readonly kind = 'none' as const

  async isAvailable(): Promise<boolean> {
    return false
  }

  async execute(
    _req: SandboxExecutionRequest,
    _workspace: ProjectWorkspace,
  ): Promise<SandboxExecutionResult> {
    return {
      stdout: '',
      stderr: 'Windows sandbox driver is not yet implemented. Use WSL runtime instead.',
      exitCode: 1,
      timedOut: false,
      sandbox: 'none',
      runtime: _req.runtime,
      durationMs: 0,
    }
  }

  canonicalizePath(workspacePath: string): string {
    return workspacePath
  }
}

export const windowsDriver = new WindowsSandboxDriver()
