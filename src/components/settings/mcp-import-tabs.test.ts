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

  it('handles empty string gracefully', () => {
    const result = parseCommand('')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', ''])
    expect(result.preview).toBe('npx -y ')
  })

  it('handles only whitespace gracefully', () => {
    const result = parseCommand('   ')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y', ''])
    expect(result.preview).toBe('npx -y ')
  })

  it('handles command with only flags (no package)', () => {
    const result = parseCommand('npx -y')
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['-y'])
    expect(result.preview).toBe('npx -y')
  })
})

describe('deriveServerName', () => {
  it('strips @scope/ prefix', () => {
    expect(deriveServerName('@modelcontextprotocol/server-filesystem')).toBe('server-filesystem')
  })

  it('strips -mcp suffix', () => {
    expect(deriveServerName('obsidian-mcp-seekstone')).toBe('obsidian-seekstone')
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

  it('handles empty string gracefully', () => {
    expect(deriveServerName('')).toBe('')
  })

  it('handles only whitespace gracefully', () => {
    expect(deriveServerName('   ')).toBe('')
  })

  it('handles flag-only input (like -y)', () => {
    expect(deriveServerName('npx -y')).toBe('-y')
  })

  it('handles single dash', () => {
    expect(deriveServerName('-')).toBe('-')
  })

  it('handles command ending with -mcp', () => {
    expect(deriveServerName('server-mcp')).toBe('server')
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

  it('handles negative tool count gracefully', () => {
    // Negative counts treated as 0 for safety
    expect(buildConnectionSummary(-1, 0)).toBe('Connected — found -1 tools')
  })

  it('handles negative resource count gracefully', () => {
    // Negative resources are excluded (treated as 0)
    expect(buildConnectionSummary(1, -2)).toBe('Connected — found 1 tool')
  })

  it('handles very large numbers', () => {
    expect(buildConnectionSummary(1000000, 999999)).toBe('Connected — found 1000000 tools, 999999 resources')
  })

  it('handles NaN tool count', () => {
    expect(buildConnectionSummary(NaN, 0)).toBe('Connected — found 0 tools')
  })

  it('handles NaN resource count', () => {
    expect(buildConnectionSummary(5, NaN)).toBe('Connected — found 5 tools')
  })

  it('handles Infinity', () => {
    expect(buildConnectionSummary(Infinity, Infinity)).toBe('Connected — found 0 tools')
  })
})

describe('integration - common UI scenarios', () => {
  it('handles user typing then deleting all text', () => {
    const result1 = parseCommand('some-package')
    expect(result1.command).toBe('npx')

    const result2 = parseCommand('')
    expect(result2.command).toBe('npx')
    expect(result2.args).toEqual(['-y', ''])
  })

  it('handles rapid input changes (copy-paste)', () => {
    const inputs = [
      'npx @modelcontextprotocol/server-filesystem',
      '@modelcontextprotocol/server-filesystem',
      'server-filesystem',
    ]

    inputs.forEach(input => {
      const parsed = parseCommand(input)
      const name = deriveServerName(input)
      expect(parsed.command).toBeTruthy()
      expect(parsed.args).toBeInstanceOf(Array)
      expect(typeof name).toBe('string')
    })
  })

  it('handles malformed npx commands gracefully', () => {
    const malformed = [
      'npx',
      'npx ',
      'npx  ',
      'npx -y',
      'npx -y ',
    ]

    malformed.forEach(input => {
      const parsed = parseCommand(input)
      const name = deriveServerName(input)
      expect(parsed).toHaveProperty('command')
      expect(parsed).toHaveProperty('args')
      expect(parsed).toHaveProperty('preview')
      expect(typeof name).toBe('string')
    })
  })

  it('handles special characters without crashing', () => {
    const special = [
      '@scope/package@latest',
      'package-name_with_underscore',
      'package.with.dots',
      'package/with/slashes',
    ]

    special.forEach(input => {
      expect(() => parseCommand(input)).not.toThrow()
      expect(() => deriveServerName(input)).not.toThrow()
    })
  })

  it('buildConnectionSummary never throws', () => {
    const cases = [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, -1],
      [NaN, NaN],
      [Infinity, Infinity],
    ] as const

    cases.forEach(([tools, resources]) => {
      expect(() => buildConnectionSummary(tools, resources)).not.toThrow()
    })
  })
})
