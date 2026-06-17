// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPresetWarning, formatPresetCommand } from './mcp-preset-warning'
import { PresetWarningContent } from './mcp-preset-warning-content'
import type { McpPreset } from '@/types'

const stdioPreset: McpPreset = {
  id: 'mcp-filesystem',
  name: 'Filesystem',
  description: 'Read, write, and manage files on your local filesystem',
  category: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
}

const remotePreset: McpPreset = {
  id: 'mcp-remote',
  name: 'Remote API',
  description: 'A remote MCP server',
  category: 'productivity',
  transport: 'sse',
  url: 'https://example.com/sse',
}

describe('formatPresetCommand', () => {
  it('joins command and args verbatim', () => {
    expect(formatPresetCommand(stdioPreset)).toBe(
      'npx -y @modelcontextprotocol/server-filesystem /tmp',
    )
  })

  it('returns undefined when there is no command', () => {
    expect(formatPresetCommand(remotePreset)).toBeUndefined()
  })
})

describe('getPresetWarning', () => {
  it('flags stdio presets as high severity with the exact command', () => {
    const warning = getPresetWarning(stdioPreset)
    expect(warning.severity).toBe('high')
    expect(warning.command).toBe('npx -y @modelcontextprotocol/server-filesystem /tmp')
    expect(warning.message).toContain('runs a command on your system')
    expect(warning.sourceUrl).toBe(stdioPreset.homepage)
  })

  it('flags remote transports as medium severity with a network warning and no command', () => {
    const warning = getPresetWarning(remotePreset)
    expect(warning.severity).toBe('medium')
    expect(warning.command).toBeUndefined()
    expect(warning.message).toContain('connects to a remote URL')
  })

  it('prefers an explicit sourceUrl over homepage', () => {
    const warning = getPresetWarning({ ...stdioPreset, sourceUrl: 'https://trusted.example' })
    expect(warning.sourceUrl).toBe('https://trusted.example')
  })

  it('uses a preset-specific warning override when present', () => {
    const warning = getPresetWarning({ ...stdioPreset, warning: 'Custom danger text' })
    expect(warning.message).toBe('Custom danger text')
  })
})

describe('PresetWarningContent', () => {
  it('renders the warning message and the exact command for a stdio preset', () => {
    const warning = getPresetWarning(stdioPreset)
    const html = renderToStaticMarkup(
      <PresetWarningContent warning={warning} presetName={stdioPreset.name} />,
    )
    expect(html).toContain('runs a command on your system')
    expect(html).toContain('npx -y @modelcontextprotocol/server-filesystem /tmp')
    expect(html).toContain('data-testid="preset-command"')
  })

  it('renders a "View source" link when a source URL is available', () => {
    const warning = getPresetWarning(stdioPreset)
    const html = renderToStaticMarkup(
      <PresetWarningContent warning={warning} presetName={stdioPreset.name} />,
    )
    expect(html).toContain(stdioPreset.homepage!)
    expect(html).toContain('View source')
  })

  it('omits the command block for remote presets', () => {
    const warning = getPresetWarning(remotePreset)
    const html = renderToStaticMarkup(
      <PresetWarningContent warning={warning} presetName={remotePreset.name} />,
    )
    expect(html).not.toContain('Command to run')
    expect(html).toContain('connects to a remote URL')
  })
})
