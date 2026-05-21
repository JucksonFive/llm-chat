import { webFetchTool } from './web-fetch.js'
import { createWebSearchTool, webSearchTool } from './web-search.js'
import { codeExecutorTool } from './code-executor.js'
import { fileReaderTool } from './file-reader.js'
import { fileWriterTool } from './file-writer.js'
import { calculatorTool } from './calculator.js'
import { pdfReaderTool } from './pdf-reader.js'
import { datetimeTool } from './datetime.js'
import { createImageGeneratorTool } from './image-generator.js'
import { deepResearchTool } from './deep-research.js'
import { createIndexDocumentTool } from './document-indexer.js'
import { createSearchDocumentTool } from './document-search.js'
import type { Tool } from 'ai'

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
  | 'index-document'
  | 'search-document'

export interface BuiltInToolMeta {
  id: BuiltInToolId
  name: string
  description: string
}

type ToolEntry = { name: string; description: string; tool?: Tool; factory?: (apiKey: string) => Tool }

const BUILT_IN_TOOLS: Record<BuiltInToolId, ToolEntry> = {
  'web-fetch': {
    name: 'Fetch URL',
    description: 'Fetch content from a URL',
    tool: webFetchTool,
  },
  'web-search': {
    name: 'Web Search',
    description: 'Search the web for information (LLM-rewritten query variants + rank fusion when an OpenAI key is available)',
    tool: webSearchTool,
    factory: createWebSearchTool,
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
  'file-writer': {
    name: 'File Writer',
    description: 'Write or create files on the filesystem',
    tool: fileWriterTool,
  },
  'calculator': {
    name: 'Calculator',
    description: 'Evaluate mathematical expressions',
    tool: calculatorTool,
  },
  'pdf-reader': {
    name: 'PDF Reader',
    description: 'Read and extract text from PDF files',
    tool: pdfReaderTool,
  },
  'datetime': {
    name: 'Date & Time',
    description: 'Get current time, convert timezones, calculate date differences',
    tool: datetimeTool,
  },
  'image-generator': {
    name: 'Image Generator',
    description: 'Generate images with OpenAI DALL-E / gpt-image-1',
    factory: createImageGeneratorTool,
  },
  'deep-research': {
    name: 'Deep Research',
    description: 'Multi-step web research with source compilation',
    tool: deepResearchTool,
  },
  'index-document': {
    name: 'Index Document',
    description: 'Embed and store a large document (PDF or text) for semantic search',
    factory: createIndexDocumentTool,
  },
  'search-document': {
    name: 'Search Document',
    description: 'Semantically query an already-indexed document for relevant passages',
    factory: createSearchDocumentTool,
  },
}

export function getBuiltInToolList(): BuiltInToolMeta[] {
  return Object.entries(BUILT_IN_TOOLS).map(([id, meta]) => ({
    id: id as BuiltInToolId,
    name: meta.name,
    description: meta.description,
  }))
}

export function getBuiltInTools(enabledIds: BuiltInToolId[], apiKey?: string): Record<string, Tool> {
  const result: Record<string, Tool> = {}
  for (const id of enabledIds) {
    const entry = BUILT_IN_TOOLS[id]
    if (entry) {
      // Prefer the factory when an API key is available so the tool can use
      // LLM-backed features (rewrites, reranks, image generation). Fall back
      // to the static instance otherwise so the tool still works without a key.
      const t = (entry.factory && apiKey ? entry.factory(apiKey) : undefined) ?? entry.tool
      if (t) {
        // Tool name must match what we tell the model in the system prompt.
        // AI SDK tool names typically use snake_case; we expose the id as-is
        // with hyphens converted to underscores (e.g. `web-search` -> `web_search`).
        result[id.replace(/-/g, '_')] = t
      }
    }
  }
  return result
}
