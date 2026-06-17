import type { McpPreset } from '@/types'

export type McpPresetWarningSeverity = 'high' | 'medium'

export interface McpPresetWarning {
  /** Severity drives the visual treatment (red for stdio command execution, amber for network). */
  severity: McpPresetWarningSeverity
  /** Short heading for the confirmation modal. */
  title: string
  /** Full explanatory warning text shown to the user. */
  message: string
  /**
   * For stdio presets, the exact command (with args) that will be executed,
   * e.g. `npx -y @modelcontextprotocol/server-filesystem /tmp`. Undefined for
   * remote transports where no local command runs.
   */
  command?: string
  /** A trustworthy source/homepage URL for the preset, if known. */
  sourceUrl?: string
}

const STDIO_WARNING =
  'This MCP server runs a command on your system. It will have access to your files, network, and environment. Only install servers from trusted sources.'

const NETWORK_WARNING =
  'This MCP server connects to a remote URL. It will have network access. Ensure you trust the server operator.'

/**
 * Build the verbatim command string that will be executed for a stdio preset.
 * Returns undefined when there is no command (e.g. remote transports).
 */
export function formatPresetCommand(preset: Pick<McpPreset, 'command' | 'args'>): string | undefined {
  if (!preset.command) return undefined
  const args = preset.args ?? []
  return [preset.command, ...args].join(' ')
}

/**
 * Pure helper that derives the security warning shown before installing a preset.
 *
 * - `stdio` transports execute arbitrary local commands -> high severity, command shown.
 * - `sse` / `streamable-http` transports only open a network connection -> medium severity.
 *
 * A preset-specific `warning` overrides the default message body when present.
 */
export function getPresetWarning(preset: McpPreset): McpPresetWarning {
  const sourceUrl = preset.sourceUrl ?? preset.homepage

  if (preset.transport === 'stdio') {
    return {
      severity: 'high',
      title: 'Run a command on your system?',
      message: preset.warning ?? STDIO_WARNING,
      command: formatPresetCommand(preset),
      sourceUrl,
    }
  }

  return {
    severity: 'medium',
    title: 'Connect to a remote server?',
    message: preset.warning ?? NETWORK_WARNING,
    sourceUrl,
  }
}
