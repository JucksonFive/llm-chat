import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

interface McpConnection {
  client: Client
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
}

const connections = new Map<string, McpConnection>()

/**
 * Environment variables that are safe to propagate to MCP stdio child processes.
 * These are needed for the child process to locate executables, libraries, and
 * write temp files, but contain no application secrets.
 */
export const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TMPDIR', 'TMP', 'TEMP',
  'NODE_PATH', 'NODE_ENV',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  // platform-specific dynamic linker paths
  'DYLD_LIBRARY_PATH', 'LD_LIBRARY_PATH',
] as const

/**
 * Patterns matching environment variable names that must never be forwarded to
 * MCP child processes, even if they ever appear in SAFE_ENV_KEYS. Acts as a
 * defense-in-depth deny-list on top of the allowlist.
 */
export const DENY_PATTERNS: RegExp[] = [
  /_API_KEY$/i, /_SECRET/i, /_PASSWORD/i, /_TOKEN$/i,
  /^AWS_/i, /^LLM_CHAT_/i, /_CREDENTIALS$/i,
]

function isDenied(key: string): boolean {
  return DENY_PATTERNS.some((pattern) => pattern.test(key))
}

/**
 * Builds the environment for an MCP stdio child process. Only an explicit
 * allowlist of safe variables from the parent process are propagated, and any
 * key matching a secret deny-pattern is dropped. User-supplied `configEnv`
 * always takes precedence (and bypasses the allowlist, since it was set
 * intentionally) but is still subject to the deny-list for safety.
 */
export function sanitizeEnv(
  env: NodeJS.ProcessEnv,
  configEnv?: Record<string, string>,
): Record<string, string> {
  const clean: Record<string, string> = {}

  for (const key of SAFE_ENV_KEYS) {
    const value = env[key]
    if (value !== undefined && !isDenied(key)) {
      clean[key] = value
    }
  }

  // User-provided env vars override the safe defaults. These are explicitly set
  // by the user in the MCP server config (e.g. an API token the MCP server
  // itself needs), so neither the allowlist nor the deny-list applies to them.
  if (configEnv) {
    for (const [key, value] of Object.entries(configEnv)) {
      if (value !== undefined) {
        clean[key] = value
      }
    }
  }

  return clean
}

export async function connect(config: McpServerConfig): Promise<Client> {
  const existing = connections.get(config.id)
  if (existing) return existing.client

  let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

  if (config.transport === 'stdio') {
    if (!config.command) throw new Error(`MCP server "${config.name}": command is required for stdio transport`)
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: sanitizeEnv(process.env, config.env),
    })
  } else if (config.transport === 'sse') {
    if (!config.url) throw new Error(`MCP server "${config.name}": url is required for SSE transport`)
    transport = new SSEClientTransport(new URL(config.url))
  } else {
    if (!config.url) throw new Error(`MCP server "${config.name}": url is required for streamable-http transport`)
    transport = new StreamableHTTPClientTransport(new URL(config.url))
  }

  const client = new Client({ name: 'llm-chat', version: '1.0.0' })
  await client.connect(transport)

  connections.set(config.id, { client, transport })
  return client
}

export async function disconnect(id: string): Promise<void> {
  const conn = connections.get(id)
  if (!conn) return
  try {
    await conn.client.close()
  } catch {
    // ignore cleanup errors
  }
  connections.delete(id)
}

export async function disconnectAll(): Promise<void> {
  const ids = [...connections.keys()]
  await Promise.allSettled(ids.map(disconnect))
}

export async function getTools(config: McpServerConfig) {
  const client = await connect(config)
  const result = await client.listTools()
  return result.tools
}

export async function callTool(configId: string, toolName: string, args: Record<string, unknown>) {
  const conn = connections.get(configId)
  if (!conn) throw new Error(`MCP server ${configId} is not connected`)
  const result = await conn.client.callTool({ name: toolName, arguments: args })
  // Extract text content from MCP response
  if (result.content && Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
    if (textParts.length > 0) return textParts.join('\n')
  }
  return result.content
}

export async function getServerCapabilities(config: McpServerConfig) {
  const client = await connect(config)
  return client.getServerCapabilities()
}

export async function getResources(config: McpServerConfig) {
  const client = await connect(config)
  const caps = client.getServerCapabilities()
  if (!caps?.resources) return []
  const result = await client.listResources()
  return result.resources
}

export async function readResource(configId: string, uri: string) {
  const conn = connections.get(configId)
  if (!conn) throw new Error(`MCP server ${configId} is not connected`)
  const result = await conn.client.readResource({ uri })
  return result.contents
}

export async function getPrompts(config: McpServerConfig) {
  const client = await connect(config)
  const caps = client.getServerCapabilities()
  if (!caps?.prompts) return []
  const result = await client.listPrompts()
  return result.prompts
}

export async function getPrompt(configId: string, name: string, args?: Record<string, string>) {
  const conn = connections.get(configId)
  if (!conn) throw new Error(`MCP server ${configId} is not connected`)
  const result = await conn.client.getPrompt({ name, arguments: args })
  return result
}
