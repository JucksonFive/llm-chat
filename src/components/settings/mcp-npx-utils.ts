export function parseCommand(input: string): { command: string; args: string[]; preview: string } {
  const trimmed = input.trim()
  const parts = trimmed.split(/\s+/)
  const looksLikeCommand = parts.length > 1 && !trimmed.startsWith('@') && !trimmed.startsWith('-')
  if (looksLikeCommand) {
    return { command: parts[0], args: parts.slice(1), preview: trimmed }
  }
  return { command: 'npx', args: ['-y', trimmed], preview: `npx -y ${trimmed}` }
}

export function deriveServerName(input: string): string {
  const trimmed = input.trim()
  const parts = trimmed.split(/\s+/)
  const candidate = parts.at(-1) ?? trimmed
  return candidate.replace(/^@[^/]+\//, '').replace(/-mcp$|^mcp-/, '')
}
