import { describe, expect, it } from 'vitest'
import { parseCommand, deriveServerName, buildConnectionSummary } from './mcp-npx-utils'

describe('parseCommand', () => {
  it('wraps a bare package name with npx -y', () => {
    const result = parseCommand('obsidian-mcp-seekstone')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', 'obsidian-mcp-seekstone'])
    expect(result.preview).toBe('npx -y obsidian-mcp-seekstone')
  })

  it('wraps a scoped package name with npx -y', () => {
    const result = parseCommand('@modelcontextprotocol/server-filesystem')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])
    expect(result.preview).toBe('npx -y @modelcontextprotocol/server-filesystem')
  })

  it('treats a multi-token command as command + args', () => {
    const result = parseCommand('npx skillfish add rysweet/amplihack')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['skillfish', 'add', 'rysweet/amplihack'])
    expect(result.preview).toBe('npx skillfish add rysweet/amplihack')
  })

  it('handles leading/trailing whitespace', () => {
    const result = parseCommand('  seekstone  ')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', 'seekstone'])
  })

  it('treats a flag-starting input as a package name', () => {
    const result = parseCommand('-y some-package')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', '-y some-package'])
  })
})

describe('deriveServerName', () => {
  it('strips @scope/ prefix', () => {
    expect(deriveServerName('@modelcontextprotocol/server-filesystem')).toBe('server-filesystem')
  })

  it('strips -mcp suffix', () => {
    expect(deriveServerName('obsidian-mcp-seekstone')).toBe('obsidian-mcp-seekstone')
  })

  it('strips mcp- prefix', () => {
    expect(deriveServerName('mcp-filesystem')).toBe('filesystem')
  })

  it('strips both @scope/ and -mcp suffix', () => {
    expect(deriveServerName('@org/my-mcp')).toBe('my')
  })

  it('uses last token of a multi-word command', () => {
    expect(deriveServerName('npx skillfish add rysweet/amplihack')).toBe('rysweet/amplihack')
  })

  it('handles leading/trailing whitespace', () => {
    expect(deriveServerName('  seekstone  ')).toBe('seekstone')
  })
})

describe('buildConnectionSummary', () => {
  it('singular tool, no resources', () => {
    expect(buildConnectionSummary(1, 0)).toBe('Connected — found 1 tool')
  })

  it('plural tools, no resources', () => {
    expect(buildConnectionSummary(3, 0)).toBe('Connected — found 3 tools')
  })

  it('zero tools, no resources', () => {
    expect(buildConnectionSummary(0, 0)).toBe('Connected — found 0 tools')
  })

  it('tools and singular resource', () => {
    expect(buildConnectionSummary(2, 1)).toBe('Connected — found 2 tools, 1 resource')
  })

  it('tools and plural resources', () => {
    expect(buildConnectionSummary(2, 4)).toBe('Connected — found 2 tools, 4 resources')
  })
})
