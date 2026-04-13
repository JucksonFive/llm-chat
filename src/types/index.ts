export type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'deepseek'

export type BuiltInToolId =
  | 'web-fetch'
  | 'web-search'
  | 'code-executor'
  | 'file-reader'
  | 'file-writer'
  | 'calculator'
  | 'pdf-reader'
  | 'datetime'
  | 'image-generator'
  | 'deep-research'

export interface ProviderMeta {
  id: ProviderId
  name: string
  models: string[]
  icon: string
  color: string
  requiresApiKey: boolean
  freeTextModel?: boolean
}

export interface Agent {
  id: string
  name: string
  providerId: ProviderId
  model: string
  apiKey: string
  systemPrompt: string
  createdAt: number
  avatarColor: string
  mcpServerIds: string[]
  builtInToolIds: BuiltInToolId[]
}

export interface ToolCallInfo {
  id: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  status: 'calling' | 'complete' | 'error'
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  isStreaming?: boolean
  toolCalls?: ToolCallInfo[]
}

export interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  createdAt: number
  presetId?: string
}

export interface McpPreset {
  id: string
  name: string
  description: string
  category: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  envPlaceholders?: { key: string; label: string; description: string; required: boolean }[]
  homepage?: string
}

export interface Conversation {
  id: string
  agentId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Memory {
  id: string
  agentId: string
  content: string
  createdAt: number
}

export interface McpResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
  serverId: string
  serverName: string
}

export interface McpPrompt {
  name: string
  description?: string
  arguments?: { name: string; description?: string; required?: boolean }[]
  serverId: string
  serverName: string
}

export interface McpResourceContent {
  uri: string
  text?: string
  blob?: string
  mimeType?: string
}
