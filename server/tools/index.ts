import { webFetchTool } from './web-fetch.js'
import { webSearchTool } from './web-search.js'
import { codeExecutorTool } from './code-executor.js'
import { fileReaderTool } from './file-reader.js'

export type BuiltInToolId = 'web-fetch' | 'web-search' | 'code-executor' | 'file-reader'

export interface BuiltInToolMeta {
  id: BuiltInToolId
  name: string
  description: string
}

const BUILT_IN_TOOLS: Record<BuiltInToolId, { name: string; description: string; tool: typeof webFetchTool }> = {
  'web-fetch': {
    name: 'Fetch URL',
    description: 'Fetch content from a URL',
    tool: webFetchTool,
  },
  'web-search': {
    name: 'Web Search',
    description: 'Search the web for information',
    tool: webSearchTool,
  },
  'code-executor': {
    name: 'Code Executor',
    description: 'Execute JavaScript, Python, or shell code',
    tool: codeExecutorTool,
  },
  'file-reader': {
    name: 'File Reader',
    description: 'Read files from the local filesystem',
    tool: fileReaderTool,
  },
}

export function getBuiltInToolList(): BuiltInToolMeta[] {
  return Object.entries(BUILT_IN_TOOLS).map(([id, meta]) => ({
    id: id as BuiltInToolId,
    name: meta.name,
    description: meta.description,
  }))
}

export function getBuiltInTools(enabledIds: BuiltInToolId[]): Record<string, typeof webFetchTool> {
  const result: Record<string, typeof webFetchTool> = {}
  for (const id of enabledIds) {
    const entry = BUILT_IN_TOOLS[id]
    if (entry) {
      result[`builtin__${id.replace(/-/g, '_')}`] = entry.tool
    }
  }
  return result
}
