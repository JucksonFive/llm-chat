export type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'deepseek'

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
  transport: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  createdAt: number
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
