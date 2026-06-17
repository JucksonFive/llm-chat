export interface McpPreset {
  id: string
  name: string
  description: string
  category: 'filesystem' | 'search' | 'database' | 'developer' | 'productivity'
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

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files on your local filesystem',
    category: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    category: 'search',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envPlaceholders: [
      { key: 'BRAVE_API_KEY', label: 'Brave API Key', description: 'Get from brave.com/search/api', required: true },
    ],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Interact with GitHub repos, issues, and pull requests',
    category: 'developer',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envPlaceholders: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Token', description: 'Personal access token from github.com/settings/tokens', required: true },
    ],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
  {
    id: 'mcp-memory',
    name: 'Memory',
    description: 'Persistent memory using a local knowledge graph',
    category: 'productivity',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    category: 'database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '/tmp/test.db'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    category: 'developer',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
  },
  {
    id: 'mcp-everything',
    name: 'Everything (Demo)',
    description: 'Demo server showcasing all MCP features: tools, resources, and prompts',
    category: 'developer',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
  },
]
