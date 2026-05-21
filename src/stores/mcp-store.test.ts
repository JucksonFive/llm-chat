// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMcpStore } from './mcp-store'
import type { McpServerConfig } from '@/types'

const fetchMock = vi.fn()

function reset() {
  useMcpStore.setState({ servers: [], loaded: false })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 's1',
    name: 'Filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'fs'],
    createdAt: 1,
    ...overrides,
  }
}

describe('loadServers', () => {
  it('sets servers and marks loaded=true', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => [makeServer({ id: 'a' }), makeServer({ id: 'b' })],
    })

    await useMcpStore.getState().loadServers()
    const state = useMcpStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.servers.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('addServer', () => {
  it('POSTs and appends the server', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-1' }) })

    const server = await useMcpStore.getState().addServer({
      name: 'Local',
      transport: 'stdio',
      command: 'echo',
      args: ['hello'],
    })

    expect(server.id).toBe('srv-1')
    expect(server.name).toBe('Local')
    expect(useMcpStore.getState().servers).toHaveLength(1)
    expect(useMcpStore.getState().servers[0].id).toBe('srv-1')
  })
})

describe('updateServer', () => {
  it('updates the matching server', async () => {
    fetchMock.mockResolvedValueOnce({})
    useMcpStore.setState({
      servers: [makeServer({ id: 'a', name: 'old' }), makeServer({ id: 'b' })],
    })

    await useMcpStore.getState().updateServer('a', { name: 'new', command: 'bash' })

    const updated = useMcpStore.getState().servers.find((s) => s.id === 'a')!
    expect(updated.name).toBe('new')
    expect(updated.command).toBe('bash')
  })

  it('is a no-op when the server is missing', async () => {
    await useMcpStore.getState().updateServer('missing', { name: 'x' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('deleteServer', () => {
  it('removes the matching server', async () => {
    fetchMock.mockResolvedValueOnce({})
    useMcpStore.setState({
      servers: [makeServer({ id: 'a' }), makeServer({ id: 'b' })],
    })

    await useMcpStore.getState().deleteServer('a')
    expect(useMcpStore.getState().servers.map((s) => s.id)).toEqual(['b'])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/db/mcp-servers/a',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('getServer', () => {
  it('returns the matching server or undefined', () => {
    useMcpStore.setState({ servers: [makeServer({ id: 'a' })] })
    expect(useMcpStore.getState().getServer('a')?.id).toBe('a')
    expect(useMcpStore.getState().getServer('nope')).toBeUndefined()
  })
})
