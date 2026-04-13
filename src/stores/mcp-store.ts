import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { McpServerConfig } from '@/types'

interface McpState {
  servers: McpServerConfig[]
  addServer: (config: Omit<McpServerConfig, 'id' | 'createdAt'>) => McpServerConfig
  updateServer: (id: string, updates: Partial<McpServerConfig>) => void
  deleteServer: (id: string) => void
  getServer: (id: string) => McpServerConfig | undefined
}

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      servers: [],

      addServer: (data) => {
        const server: McpServerConfig = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        }
        set((state) => ({ servers: [...state.servers, server] }))
        return server
      },

      updateServer: (id, updates) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }))
      },

      deleteServer: (id) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
        }))
      },

      getServer: (id) => {
        return get().servers.find((s) => s.id === id)
      },
    }),
    { name: 'llm-chat-mcp-servers' }
  )
)
