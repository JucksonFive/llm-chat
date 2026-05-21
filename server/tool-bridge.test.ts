import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub the mcp-manager module before importing the bridge.
const getTools = vi.fn()
const callTool = vi.fn()
vi.mock('./mcp-manager.js', () => ({
  getTools: (cfg: unknown) => getTools(cfg),
  callTool: (id: string, name: string, args: Record<string, unknown>) => callTool(id, name, args),
}))

// Imported lazily so the mock is in place.
let buildToolsFromMcpServers: typeof import('./tool-bridge').buildToolsFromMcpServers

beforeEach(async () => {
  getTools.mockReset()
  callTool.mockReset()
  ;({ buildToolsFromMcpServers } = await import('./tool-bridge'))
})

afterEach(() => {
  vi.resetModules()
})

const baseSchema = { type: 'object' as const, properties: {} }

const fsServer = { id: 'fs', name: 'Filesystem', transport: 'stdio' as const }
const dbServer = { id: 'db', name: 'Database', transport: 'stdio' as const }

describe('buildToolsFromMcpServers', () => {
  it('uses tool names directly when there are no collisions', async () => {
    getTools.mockImplementation(async (cfg: { id: string }) => {
      if (cfg.id === 'fs') return [{ name: 'read_file', description: '', inputSchema: baseSchema }]
      if (cfg.id === 'db') return [{ name: 'query', description: '', inputSchema: baseSchema }]
      return []
    })

    const tools = await buildToolsFromMcpServers([fsServer, dbServer])
    expect(Object.keys(tools).sort()).toEqual(['query', 'read_file'])
  })

  it('namespaces all tool names with the server name when ANY collision exists', async () => {
    getTools.mockImplementation(async (cfg: { id: string }) => {
      if (cfg.id === 'fs') return [
        { name: 'list', description: '', inputSchema: baseSchema },
        { name: 'unique_fs', description: '', inputSchema: baseSchema },
      ]
      if (cfg.id === 'db') return [
        { name: 'list', description: '', inputSchema: baseSchema },
      ]
      return []
    })

    const tools = await buildToolsFromMcpServers([fsServer, dbServer])
    // Even the collision-free `unique_fs` gets namespaced because some name in
    // the result set collides — this matches the implementation's "all or
    // nothing" namespacing.
    expect(Object.keys(tools).sort()).toEqual([
      'Database__list',
      'Filesystem__list',
      'Filesystem__unique_fs',
    ])
  })

  it('skips servers whose getTools throws but still returns the rest', async () => {
    getTools.mockImplementation(async (cfg: { id: string }) => {
      if (cfg.id === 'fs') throw new Error('connection refused')
      if (cfg.id === 'db') return [{ name: 'query', description: '', inputSchema: baseSchema }]
      return []
    })

    const tools = await buildToolsFromMcpServers([fsServer, dbServer])
    expect(Object.keys(tools)).toEqual(['query'])
  })

  it('returns an empty object when given no servers', async () => {
    expect(await buildToolsFromMcpServers([])).toEqual({})
    expect(getTools).not.toHaveBeenCalled()
  })

  it('built tool execute calls back into mcpManager with id + name + args', async () => {
    getTools.mockResolvedValueOnce([
      { name: 'do_thing', description: '', inputSchema: baseSchema },
    ])
    callTool.mockResolvedValueOnce({ ok: true })

    const tools = await buildToolsFromMcpServers([fsServer])
    const t = tools.do_thing as { execute: (args: Record<string, unknown>) => Promise<unknown> }
    const result = await t.execute({ a: 1 })

    expect(callTool).toHaveBeenCalledWith('fs', 'do_thing', { a: 1 })
    expect(result).toEqual({ ok: true })
  })
})
