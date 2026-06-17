import { create } from 'zustand'
import type { McpServerConfig } from '@/types'
import { apiFetch } from '@/lib/api-fetch'

interface McpState {
  servers: McpServerConfig[]
  loaded: boolean
  loadServers: () => Promise<void>
  addServer: (config: Omit<McpServerConfig, 'id' | 'createdAt'>) => Promise<McpServerConfig>
  updateServer: (id: string, updates: Partial<McpServerConfig>) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  getServer: (id: string) => McpServerConfig | undefined
}

export const useMcpStore = create<McpState>()((set, get) => ({
  servers: [],
  loaded: false,

  loadServers: async () => {
    const res = await fetch('/api/db/mcp-servers')
    const servers = await res.json()
    set({ servers, loaded: true })
  },

  addServer: async (data) => {
    const res = await apiFetch('/api/db/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const { id } = await res.json()
    const server: McpServerConfig = { ...data, id, createdAt: Date.now() }
    set((state) => ({ servers: [...state.servers, server] }))
    return server
  },

  updateServer: async (id, updates) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return
    await apiFetch(`/api/db/mcp-servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...server, ...updates }),
    })
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
  },

  deleteServer: async (id) => {
    await apiFetch(`/api/db/mcp-servers/${id}`, { method: 'DELETE' })
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
    }))
  },

  getServer: (id) => {
    return get().servers.find((s) => s.id === id)
  },
}))
