import { describe, expect, it } from 'vitest'
import { MCP_PRESETS } from './mcp-presets.js'

describe('MCP_PRESETS', () => {
  it('has unique ids', () => {
    const ids = MCP_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset has the required fields', () => {
    for (const preset of MCP_PRESETS) {
      expect(preset.id).toBeTypeOf('string')
      expect(preset.name).toBeTypeOf('string')
      expect(preset.description).toBeTypeOf('string')
      expect(preset.category).toBeTypeOf('string')
      expect(['stdio', 'sse', 'streamable-http']).toContain(preset.transport)
    }
  })

  it('every category is one of the documented set', () => {
    const allowed = ['filesystem', 'search', 'database', 'developer', 'productivity']
    for (const preset of MCP_PRESETS) {
      expect(allowed).toContain(preset.category)
    }
  })

  it('stdio presets have a command', () => {
    for (const preset of MCP_PRESETS) {
      if (preset.transport === 'stdio') {
        expect(preset.command).toBeTypeOf('string')
        expect(preset.command!.length).toBeGreaterThan(0)
      }
    }
  })

  it('envPlaceholder entries each have key/label/description/required', () => {
    for (const preset of MCP_PRESETS) {
      if (!preset.envPlaceholders) continue
      for (const ph of preset.envPlaceholders) {
        expect(ph.key).toBeTypeOf('string')
        expect(ph.label).toBeTypeOf('string')
        expect(ph.description).toBeTypeOf('string')
        expect(typeof ph.required).toBe('boolean')
      }
    }
  })

  it('contains the expected core presets', () => {
    const ids = new Set(MCP_PRESETS.map((p) => p.id))
    expect(ids.has('mcp-filesystem')).toBe(true)
    expect(ids.has('mcp-github')).toBe(true)
    expect(ids.has('mcp-memory')).toBe(true)
  })
})
