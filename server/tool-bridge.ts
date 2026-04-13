import { tool, jsonSchema } from 'ai'
import * as mcpManager from './mcp-manager.js'

interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export async function buildToolsFromMcpServers(
  serverConfigs: McpServerConfig[]
): Promise<Record<string, ReturnType<typeof tool>>> {
  const allTools: Record<string, ReturnType<typeof tool>> = {}
  const toolNameCounts = new Map<string, number>()

  // First pass: collect all tools and detect name collisions
  const serverTools: { config: McpServerConfig; tools: Awaited<ReturnType<typeof mcpManager.getTools>> }[] = []

  for (const config of serverConfigs) {
    try {
      const tools = await mcpManager.getTools(config)
      serverTools.push({ config, tools })
      for (const t of tools) {
        toolNameCounts.set(t.name, (toolNameCounts.get(t.name) ?? 0) + 1)
      }
    } catch (err) {
      console.error(`Failed to get tools from MCP server "${config.name}":`, err)
    }
  }

  const hasCollisions = [...toolNameCounts.values()].some((count) => count > 1)

  // Second pass: build AI SDK tools
  for (const { config, tools } of serverTools) {
    for (const mcpTool of tools) {
      const toolName = hasCollisions
        ? `${config.name}__${mcpTool.name}`
        : mcpTool.name

      allTools[toolName] = tool({
        description: mcpTool.description ?? '',
        parameters: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: async (args) => {
          return await mcpManager.callTool(config.id, mcpTool.name, args as Record<string, unknown>)
        },
      })
    }
  }

  return allTools
}
