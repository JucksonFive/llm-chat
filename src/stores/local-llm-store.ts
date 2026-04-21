import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GpuMode = 'cpu' | 'auto' | 'cuda' | 'metal' | 'vulkan'

export interface LocalModelFile {
  name: string
  path: string
  sizeBytes: number
}

export interface LocalLlmStatus {
  loaded: boolean
  modelPath?: string
  modelName?: string
  gpu?: GpuMode
  gpuLayers?: number
  contextSize?: number
  threads?: number
  gpuType?: string
  modelsDir?: string
}

interface LocalLlmState {
  // Persisted config
  selectedModelPath: string | null
  gpu: GpuMode
  gpuLayers: number
  contextSize: number
  threads: number

  // Runtime (not persisted)
  status: LocalLlmStatus
  modelsDir: string
  availableModels: LocalModelFile[]
  loading: boolean
  error: string | null

  setSelectedModelPath: (p: string | null) => void
  setGpu: (g: GpuMode) => void
  setGpuLayers: (n: number) => void
  setContextSize: (n: number) => void
  setThreads: (n: number) => void

  refreshModels: () => Promise<void>
  refreshStatus: () => Promise<void>
  loadModel: () => Promise<void>
  unloadModel: () => Promise<void>
}

export const useLocalLlmStore = create<LocalLlmState>()(
  persist(
    (set, get) => ({
      selectedModelPath: null,
      gpu: 'cpu',
      gpuLayers: 0,
      contextSize: 4096,
      threads: 4,

      status: { loaded: false },
      modelsDir: '',
      availableModels: [],
      loading: false,
      error: null,

      setSelectedModelPath: (p) => set({ selectedModelPath: p }),
      setGpu: (g) => set({ gpu: g, gpuLayers: g === 'cpu' ? 0 : Math.max(1, get().gpuLayers) }),
      setGpuLayers: (n) => set({ gpuLayers: n }),
      setContextSize: (n) => set({ contextSize: n }),
      setThreads: (n) => set({ threads: n }),

      refreshModels: async () => {
        try {
          const r = await fetch('/api/local-llm/models')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const data = await r.json()
          set({
            modelsDir: data.modelsDir ?? '',
            availableModels: data.models ?? [],
            error: null,
          })
        } catch (e: unknown) {
          set({ error: e instanceof Error ? e.message : 'Failed to list models' })
        }
      },

      refreshStatus: async () => {
        try {
          const r = await fetch('/api/local-llm/status')
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const data = await r.json()
          set({ status: data, modelsDir: data.modelsDir ?? get().modelsDir })
        } catch (e: unknown) {
          set({ error: e instanceof Error ? e.message : 'Failed to get status' })
        }
      },

      loadModel: async () => {
        const { selectedModelPath, gpu, gpuLayers, contextSize, threads } = get()
        if (!selectedModelPath) {
          set({ error: 'Select a model first' })
          return
        }
        set({ loading: true, error: null })
        try {
          const r = await fetch('/api/local-llm/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelPath: selectedModelPath,
              gpu,
              gpuLayers: gpu === 'cpu' ? 0 : gpuLayers,
              contextSize,
              threads,
            }),
          })
          const data = await r.json()
          if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
          set({ status: data })
        } catch (e: unknown) {
          set({ error: e instanceof Error ? e.message : 'Failed to load model' })
        } finally {
          set({ loading: false })
        }
      },

      unloadModel: async () => {
        set({ loading: true, error: null })
        try {
          const r = await fetch('/api/local-llm/unload', { method: 'POST' })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          set({ status: { loaded: false } })
        } catch (e: unknown) {
          set({ error: e instanceof Error ? e.message : 'Failed to unload' })
        } finally {
          set({ loading: false })
        }
      },
    }),
    {
      name: 'local-llm-storage',
      partialize: (s) => ({
        selectedModelPath: s.selectedModelPath,
        gpu: s.gpu,
        gpuLayers: s.gpuLayers,
        contextSize: s.contextSize,
        threads: s.threads,
      }),
    }
  )
)
