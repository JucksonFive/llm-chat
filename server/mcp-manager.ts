import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

interface McpConnection {
  client: Client
  transport: StdioClientTransport | SSEClientTransport
}

const connections = new Map<string, McpConnection>()

export async function connect(config: McpServerConfig): Promise<Client> {
  const existing = connections.get(config.id)
  if (existing) return existing.client

  let transport: StdioClientTransport | SSEClientTransport

  if (config.transport === 'stdio') {
    if (!config.command) throw new Error(`MCP server "${config.name}": command is required for stdio transport`)
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
    })
  } else {
    if (!config.url) throw new Error(`MCP server "${config.name}": url is required for SSE transport`)
    transport = new SSEClientTransport(new URL(config.url))
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
