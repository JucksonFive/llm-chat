import fs from 'fs'
import os from 'os'
import path from 'path'

// node-llama-cpp is a heavy native module. Import lazily so the server can
// start even if the binary is missing for the current platform.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Llama = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaModel = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaContext = any

export type GpuMode = 'cpu' | 'auto' | 'cuda' | 'metal' | 'vulkan'

export interface LoadOptions {
  modelPath: string
  gpu: GpuMode
  gpuLayers?: number // when gpu !== 'cpu'. -1 or large value = all layers on GPU
  contextSize?: number
  threads?: number
}

export interface LocalLlmStatus {
  loaded: boolean
  modelPath?: string
  modelName?: string
  gpu?: GpuMode
  gpuLayers?: number
  contextSize?: number
  threads?: number
  gpuType?: string // what actually loaded (e.g. "cuda", "metal", false)
}

interface LoadedState {
  llama: Llama
  model: LlamaModel
  context: LlamaContext
  modelPath: string
  gpu: GpuMode
  gpuLayers: number
  contextSize: number
  threads: number
  gpuType: string
}

let loaded: LoadedState | null = null
let loading: Promise<LoadedState> | null = null

function defaultModelsDir(): string {
  if (process.env.LLM_CHAT_MODELS_DIR) return process.env.LLM_CHAT_MODELS_DIR
  return path.join(os.homedir(), '.llm-chat', 'models')
}

export function getModelsDir(): string {
  const dir = defaultModelsDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch { /* ignore */ }
  return dir
}

export function listLocalModels(): { name: string; path: string; sizeBytes: number }[] {
  const dir = getModelsDir()
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const out: { name: string; path: string; sizeBytes: number }[] = []
  for (const e of entries) {
    if (!e.isFile()) continue
    if (!e.name.toLowerCase().endsWith('.gguf')) continue
    const full = path.join(dir, e.name)
    let sizeBytes = 0
    try { sizeBytes = fs.statSync(full).size } catch { /* ignore */ }
    out.push({ name: e.name, path: full, sizeBytes })
  }
  return out
}

export function getStatus(): LocalLlmStatus {
  if (!loaded) return { loaded: false }
  return {
    loaded: true,
    modelPath: loaded.modelPath,
    modelName: path.basename(loaded.modelPath),
    gpu: loaded.gpu,
    gpuLayers: loaded.gpuLayers,
    contextSize: loaded.contextSize,
    threads: loaded.threads,
    gpuType: loaded.gpuType,
  }
}

export async function unload(): Promise<void> {
  if (!loaded) return
  const state = loaded
  loaded = null
  try { await state.context?.dispose?.() } catch { /* ignore */ }
  try { await state.model?.dispose?.() } catch { /* ignore */ }
}

export async function load(opts: LoadOptions): Promise<LocalLlmStatus> {
  if (loading) await loading
  if (loaded && loaded.modelPath === opts.modelPath && loaded.gpu === opts.gpu &&
      (loaded.gpuLayers === (opts.gpuLayers ?? loaded.gpuLayers)) &&
      (loaded.contextSize === (opts.contextSize ?? loaded.contextSize))) {
    return getStatus()
  }

  if (loaded) await unload()

  loading = (async () => {
    if (!fs.existsSync(opts.modelPath)) {
      throw new Error(`Model file not found: ${opts.modelPath}`)
    }

    // Lazy import — native module may not be available on all platforms
    const mod = await import('node-llama-cpp')
    const getLlama = mod.getLlama

    // Map GpuMode to node-llama-cpp's gpu option
    const gpuArg: false | 'auto' | 'cuda' | 'metal' | 'vulkan' =
      opts.gpu === 'cpu' ? false : opts.gpu

    const llama = await getLlama({ gpu: gpuArg })
    const gpuType = llama.gpu === false ? 'cpu' : String(llama.gpu)

    const requestedGpuLayers = opts.gpu === 'cpu' ? 0 : (opts.gpuLayers ?? 999)

    const model = await llama.loadModel({
      modelPath: opts.modelPath,
      gpuLayers: requestedGpuLayers,
    })

    const contextSize = opts.contextSize ?? 4096
    const threads = opts.threads ?? Math.max(1, Math.min(8, os.cpus().length - 1))

    const context = await model.createContext({
      contextSize,
      threads,
    })

    const state: LoadedState = {
      llama,
      model,
      context,
      modelPath: opts.modelPath,
      gpu: opts.gpu,
      gpuLayers: requestedGpuLayers,
      contextSize,
      threads,
      gpuType,
    }
    loaded = state
    return state
  })()

  try {
    await loading
  } finally {
    loading = null
  }

  return getStatus()
}

export interface ChatMessageIn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamOptions {
  messages: ChatMessageIn[]
  systemPrompt?: string
  signal?: AbortSignal
  onToken: (text: string) => void
  maxTokens?: number
  temperature?: number
  topP?: number
}

/**
 * Stream a chat completion using the currently loaded local model.
 * Rebuilds a LlamaChatSession per request using the provided message history,
 * so the client remains source-of-truth for conversation state.
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  if (!loaded) throw new Error('No local model loaded. Load one from Settings → Local AI first.')

  const mod = await import('node-llama-cpp')
  const LlamaChatSession = mod.LlamaChatSession

  const systemFromMessages = opts.messages.find((m) => m.role === 'system')?.content
  const systemPrompt = opts.systemPrompt || systemFromMessages || undefined

  const history = opts.messages.filter((m) => m.role !== 'system')
  const lastUserIdx = [...history].reverse().findIndex((m) => m.role === 'user')
  if (lastUserIdx < 0) throw new Error('No user message to respond to.')
  const lastUserPos = history.length - 1 - lastUserIdx
  const prior = history.slice(0, lastUserPos)
  const lastUser = history[lastUserPos]

  const sequence = loaded.context.getSequence()
  const session = new LlamaChatSession({
    contextSequence: sequence,
    systemPrompt,
  })

  // Build history in the format node-llama-cpp expects
  if (prior.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: any[] = []
    for (let i = 0; i < prior.length; i++) {
      const m = prior[i]
      if (m.role === 'user') {
        const next = prior[i + 1]
        if (next && next.role === 'assistant') {
          mapped.push({ type: 'user', text: m.content })
          mapped.push({ type: 'model', response: [next.content] })
          i++
        } else {
          mapped.push({ type: 'user', text: m.content })
        }
      } else if (m.role === 'assistant') {
        mapped.push({ type: 'model', response: [m.content] })
      }
    }
    try {
      session.setChatHistory(mapped)
    } catch (err) {
      console.warn('[local-llm] Failed to set chat history, continuing without:', err)
    }
  }

  await session.prompt(lastUser.content, {
    signal: opts.signal,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.7,
    topP: opts.topP,
    onTextChunk: (chunk: string) => {
      if (chunk) opts.onToken(chunk)
    },
  })

  try { sequence.dispose?.() } catch { /* ignore */ }
}
