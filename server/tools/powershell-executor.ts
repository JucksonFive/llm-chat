/**
 * PowerShell Executor Tool.
 *
 * Executes PowerShell scripts in a sandboxed environment tied to the active
 * project workspace. This replaces the generic code_executor for project-bound
 * automation tasks.
 *
 * The tool is only available when a project with a configured workspace is
 * active. Execution is routed through the sandbox service, which delegates
 * to the appropriate driver (WSL bubblewrap or Windows restricted token).
 */

import { tool, jsonSchema } from 'ai'
import { executeInSandbox } from '../lib/sandbox-service.js'
import { loadProjectWorkspace } from '../lib/sandbox-service.js'
import { logSecurityEvent } from '../lib/audit-log.js'
import type { SandboxExecutionResult } from '../lib/sandbox-types.js'

// ---------------------------------------------------------------------------
// Tool definition factory
// ---------------------------------------------------------------------------

export interface PowershellExecutorOptions {
  /** The active project ID (injected, not exposed to the LLM). */
  projectId: string
  /** Permission profile for this execution. */
  permissionProfile?: string
}

/**
 * Create the powershell executor tool for a specific project context.
 * The projectId is injected by the server — the LLM never sees or controls it.
 */
export function createPowershellExecutorTool(options: PowershellExecutorOptions) {
  const { projectId, permissionProfile = 'workspace-write' } = options

  return tool({
    description:
      'Execute PowerShell scripts in a sandboxed environment. The script runs in the project workspace with PowerShell -NoLogo -NoProfile -NonInteractive. ' +
      'Use this for build commands, tests, git operations, file manipulation, and project automation. ' +
      'By default, network access is blocked and file operations are confined to the project workspace. ' +
      'Long-running scripts will be terminated after 120 seconds (max 900 seconds). ' +
      'Returns stdout, stderr, exit code, and whether the process timed out.',

    inputSchema: jsonSchema<{
      script: string
      cwd?: string
      timeoutSeconds?: number
      allowNetwork?: boolean
    }>({
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'The PowerShell script to execute.',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory relative to the project workspace root. Default: workspace root.',
        },
        timeoutSeconds: {
          type: 'number',
          description:
            'Maximum execution time in seconds. Default: 120, Max: 900.',
        },
        allowNetwork: {
          type: 'boolean',
          description:
            'Set to true if the script needs network access (e.g., downloading packages). Default: false.',
        },
      },
      required: ['script'],
    }),

    execute: async ({ script, cwd, timeoutSeconds, allowNetwork }) => {
      // Load workspace from DB (defense in depth — never trust injected projectId alone
      // without verifying the workspace actually exists)
      const workspace = loadProjectWorkspace(projectId)
      if (!workspace) {
        logSecurityEvent('powershell.execute', {
          projectId,
          success: false,
          error: 'No workspace configured',
        }, 'warning')
        return {
          stdout: '',
          stderr: 'No workspace configured for this project. Open project settings and select a workspace folder.',
          exitCode: 1,
          timedOut: false,
          sandbox: 'none' as const,
        }
      }

      // Network access depends on permission profile
      const networkAllowed =
        permissionProfile === 'full-access' ? (allowNetwork ?? false) : false

      const result: SandboxExecutionResult = await executeInSandbox({
        projectId,
        runtime: (workspace.preferredRuntime as 'windows-powershell' | 'wsl-pwsh') || 'wsl-pwsh',
        script,
        cwd,
        timeoutSeconds,
        resources: {
          network: networkAllowed,
        },
      })

      // Sanitize result for the LLM — include relevant info but trim large output
      const summary = formatExecutionResult(result, script)

      logSecurityEvent('powershell.execute', {
        projectId,
        runtime: result.runtime,
        sandboxKind: result.sandbox,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        networkAllowed,
        scriptSnippet: script.slice(0, 200),
        success: result.exitCode === 0 && !result.timedOut,
      })

      return summary
    },
  })
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

function formatExecutionResult(
  result: SandboxExecutionResult,
  script: string,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    exitCode: result.exitCode,
    sandbox: result.sandbox,
    runtime: result.runtime,
    durationMs: result.durationMs,
  }

  if (result.timedOut) {
    output.timedOut = true
  }

  // Include stdout if non-empty
  if (result.stdout) {
    output.stdout = result.stdout
  } else {
    output.stdout = '(no output)'
  }

  // Include stderr if non-empty (important for diagnostics)
  if (result.stderr) {
    output.stderr = result.stderr
  }

  // Add a helpful note for common exit codes
  if (result.exitCode !== 0) {
    if (result.timedOut) {
      output.summary = `Process timed out after ${result.durationMs}ms.`
    } else {
      output.summary = `Process exited with code ${result.exitCode}. Check stderr for details.`
    }
  } else {
    output.summary = `Process completed successfully in ${result.durationMs}ms.`
  }

  // Include script info for audit trail in the response
  output.scriptLength = script.length

  return output
}
