export type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'deepseek' | 'bedrock'

export type BuiltInToolId =
  | 'web-fetch'
  | 'web-search'
  | 'code-executor'
  | 'powershell-executor'
  | 'file-reader'
  | 'file-writer'
  | 'calculator'
  | 'pdf-reader'
  | 'datetime'
  | 'image-generator'
  | 'deep-research'
  | 'index-document'
  | 'search-document'

export type ToolRiskLevel = 'safe' | 'costly' | 'destructive'
export type ToolExecutionPolicy = 'auto' | 'approvalRequired' | 'disabled'

export interface BuiltInToolMeta {
  id: BuiltInToolId
  name: string
  description: string
  enabledByDefault: boolean
  riskLevel: ToolRiskLevel
  executionPolicy: ToolExecutionPolicy
}

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
  hasApiKey?: boolean
  systemPrompt: string
  createdAt: number
  avatarColor: string
  mcpServerIds: string[]
  builtInToolIds: BuiltInToolId[]
}

export type ToolCallStatus = 'calling' | 'complete' | 'error' | 'awaiting-approval' | 'denied'

export interface ToolCallInfo {
  id: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  status: ToolCallStatus
  startTime?: number
  /** Approval ID for awaiting-approval state. */
  approvalId?: string
  /** Risk level for approval UI display. */
  riskLevel?: ToolRiskLevel
}

export interface Attachment {
  id: string
  type: 'image' | 'pdf'
  name: string
  dataUrl?: string
  filePath?: string
  textContent?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  isStreaming?: boolean
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachments?: Attachment[]
  streamStartTime?: number
  isGeneratingContent?: boolean
  memoriesUsedCount?: number
  error?: string
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

export type McpCategory =
  | 'filesystem'
  | 'search'
  | 'database'
  | 'developer'
  | 'productivity'
  | 'diagrams'
  | 'drawing'
  | 'visualization'
  | 'ai-tools'
  | 'communication'

export interface McpPreset {
  id: string
  name: string
  description: string
  category: McpCategory
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  envPlaceholders?: { key: string; label: string; description: string; required: boolean }[]
  homepage?: string
  /** Canonical source/repository URL surfaced as a "View source" link. Falls back to `homepage`. */
  sourceUrl?: string
  /** Optional preset-specific warning that overrides the default transport warning. */
  warning?: string
}

export interface McpServerImport {
  name: string
  description?: string
  category?: McpCategory
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  envPlaceholders?: Array<{
    key: string
    label: string
    description: string
    required: boolean
  }>
  homepage?: string
}

export type McpImportPayload = McpServerImport | McpServerImport[]

export type WorkspaceKind = 'windows' | 'wsl'
export type PreferredRuntime = 'windows-powershell' | 'wsl-pwsh'
export type PermissionProfile = 'workspace-write' | 'read-only' | 'full-access'

export interface Project {
  id: string
  name: string
  description: string
  workspacePath: string
  workspaceKind: WorkspaceKind | ''
  preferredRuntime: PreferredRuntime | ''
  createdAt: number
  updatedAt: number
}

export interface Conversation {
  id: string
  agentId: string
  projectId: string | null
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Memory {
  id: string
  agentId: string
  content: string
  type: 'short' | 'long'
  createdAt: number
  lastUsedAt?: number
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

export interface IndexedDocument {
  id: string
  path: string
  chunkCount: number
  mtime: number
  indexedAt: number
}
