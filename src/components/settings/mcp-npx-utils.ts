/**
 * Parse user input into a command structure for MCP server installation.
 *
 * @param input - Raw user input (package name or full command)
 * @returns Parsed command with command, args, and preview string
 *
 * @example
 * parseCommand('server-filesystem')
 * // => { command: 'npx', args: ['-y', 'server-filesystem'], preview: 'npx -y server-filesystem' }
 *
 * @example
 * parseCommand('npx -y @scope/package')
 * // => { command: 'npx', args: ['-y', '@scope/package'], preview: 'npx -y @scope/package' }
 */
export function parseCommand(input: string): { command: string; args: string[]; preview: string } {
  const trimmed = input.trim()

  // Handle empty input
  if (!trimmed) {
    return { command: 'npx', args: ['-y', ''], preview: 'npx -y ' }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)

  // If we have multiple parts and it doesn't start with @ or -, treat as full command
  const looksLikeCommand = parts.length > 1 && !trimmed.startsWith('@') && !trimmed.startsWith('-')

  if (looksLikeCommand) {
    return { command: parts[0], args: parts.slice(1), preview: trimmed }
  }

  return { command: 'npx', args: ['-y', trimmed], preview: `npx -y ${trimmed}` }
}

/**
 * Derive a clean server name from user input by stripping common prefixes/suffixes.
 *
 * @param input - Raw user input (package name or command)
 * @returns Cleaned server name suitable for display
 *
 * @example
 * deriveServerName('@modelcontextprotocol/server-filesystem')
 * // => 'server-filesystem'
 *
 * @example
 * deriveServerName('obsidian-mcp-seekstone')
 * // => 'obsidian-seekstone'
 *
 * @example
 * deriveServerName('npx skillfish add rysweet/amplihack')
 * // => 'rysweet/amplihack'
 */
export function deriveServerName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''

  const candidate = parts[parts.length - 1]

  // Strip @scope/ prefix first
  const withoutScope = candidate.replace(/^@[^/]+\//, '')

  // Strip -mcp suffix and mcp- prefix
  return withoutScope.replace(/-mcp(?=-|$)/, '').replace(/^mcp-/, '')
}

/**
 * Build a human-readable connection summary string.
 *
 * @param toolCount - Number of tools found
 * @param resourceCount - Number of resources found
 * @returns Formatted summary string
 *
 * @example
 * buildConnectionSummary(3, 0)
 * // => 'Connected — found 3 tools'
 *
 * @example
 * buildConnectionSummary(2, 4)
 * // => 'Connected — found 2 tools, 4 resources'
 */
export function buildConnectionSummary(toolCount: number, resourceCount: number): string {
  // Handle invalid inputs gracefully
  const safeToolCount = Number.isFinite(toolCount) ? toolCount : 0
  const safeResourceCount = Number.isFinite(resourceCount) ? resourceCount : 0

  const parts = [`${safeToolCount} tool${safeToolCount !== 1 ? 's' : ''}`]
  if (safeResourceCount > 0) {
    parts.push(`${safeResourceCount} resource${safeResourceCount !== 1 ? 's' : ''}`)
  }
  return `Connected — found ${parts.join(', ')}`
}
