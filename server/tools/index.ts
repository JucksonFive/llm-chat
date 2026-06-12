import { webFetchTool } from './web-fetch.js'
import { createWebSearchTool, webSearchTool } from './web-search.js'
import { codeExecutorTool } from './code-executor.js'
import { fileReaderTool } from './file-reader.js'
import { fileWriterTool } from './file-writer.js'
import { calculatorTool } from './calculator.js'
import { pdfReaderTool } from './pdf-reader.js'
import { datetimeTool } from './datetime.js'
import { createImageGeneratorTool } from './image-generator.js'
import { deepResearchTool, createDeepResearchTool } from './deep-research.js'
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

export type ToolRiskLevel = 'safe' | 'costly' | 'destructive'
export type ToolExecutionPolicy = 'auto' | 'approvalRequired' | 'disabled'

export interface ToolContext {
  readonly hasUploadedPdf: boolean
  readonly hasIndexedDocument: boolean
  readonly workspaceAccessEnabled: boolean
}

export interface BuiltInToolMeta {
  id: BuiltInToolId
  name: string
  description: string
  enabledByDefault: boolean
  riskLevel: ToolRiskLevel
  executionPolicy: ToolExecutionPolicy
}

export interface ToolSettings {
  readonly manuallyEnabledTools: readonly BuiltInToolId[]
  readonly manuallyDisabledTools: readonly BuiltInToolId[]
}

type ToolEntry = {
  name: string
  description: string
  enabledByDefault: boolean
  riskLevel: ToolRiskLevel
  executionPolicy: ToolExecutionPolicy
  conditionallyEnabled?: (context: ToolContext) => boolean
  tool?: Tool
  factory?: (apiKey: string) => Tool
}

const BUILT_IN_TOOLS: Record<BuiltInToolId, ToolEntry> = {
  'web-fetch': {
    name: 'Fetch URL',
    description: 'Fetch content from a URL',
    enabledByDefault: true,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    tool: webFetchTool,
  },
  'web-search': {
    name: 'Web Search',
    description: 'Search the web for information (LLM-rewritten query variants + rank fusion when an OpenAI key is available)',
    enabledByDefault: true,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    tool: webSearchTool,
    factory: createWebSearchTool,
  },
  'code-executor': {
    name: 'Code Executor',
    description: 'Execute JavaScript, Python, or shell code',
    enabledByDefault: false,
    riskLevel: 'destructive',
    executionPolicy: 'approvalRequired',
    tool: codeExecutorTool,
  },
  'file-reader': {
    name: 'File Reader',
    description: 'Read files from the local filesystem',
    enabledByDefault: false,
    riskLevel: 'costly',
    executionPolicy: 'approvalRequired',
    tool: fileReaderTool,
  },
  'file-writer': {
    name: 'File Writer',
    description: 'Write or create files on the filesystem',
    enabledByDefault: false,
    riskLevel: 'destructive',
    executionPolicy: 'approvalRequired',
    tool: fileWriterTool,
  },
  'calculator': {
    name: 'Calculator',
    description: 'Evaluate mathematical expressions',
    enabledByDefault: true,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    tool: calculatorTool,
  },
  'pdf-reader': {
    name: 'PDF Reader',
    description: 'Read and extract text from PDF files',
    enabledByDefault: false,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    conditionallyEnabled: (ctx) => ctx.hasUploadedPdf,
    tool: pdfReaderTool,
  },
  'datetime': {
    name: 'Date & Time',
    description: 'Get current time, convert timezones, calculate date differences',
    enabledByDefault: true,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    tool: datetimeTool,
  },
  'image-generator': {
    name: 'Image Generator',
    description: 'Generate images with OpenAI DALL-E / gpt-image-1',
    enabledByDefault: false,
    riskLevel: 'costly',
    executionPolicy: 'disabled',
    factory: createImageGeneratorTool,
  },
  'deep-research': {
    name: 'Deep Research',
    description: 'Multi-step web research with LangGraph orchestration, iterative refinement, and source compilation',
    enabledByDefault: false,
    riskLevel: 'costly',
    executionPolicy: 'approvalRequired',
    tool: deepResearchTool,
    factory: createDeepResearchTool,
  },
  'index-document': {
    name: 'Index Document',
    description: 'Embed and store a large document (PDF or text) for semantic search',
    enabledByDefault: false,
    riskLevel: 'costly',
    executionPolicy: 'approvalRequired',
    factory: createIndexDocumentTool,
  },
  'search-document': {
    name: 'Search Document',
    description: 'Semantically query an already-indexed document for relevant passages',
    enabledByDefault: false,
    riskLevel: 'safe',
    executionPolicy: 'auto',
    conditionallyEnabled: (ctx) => ctx.hasIndexedDocument,
    factory: createSearchDocumentTool,
  },
}

export function getBuiltInToolList(): BuiltInToolMeta[] {
  return Object.entries(BUILT_IN_TOOLS).map(([id, meta]) => ({
    id: id as BuiltInToolId,
    name: meta.name,
    description: meta.description,
    enabledByDefault: meta.enabledByDefault,
    riskLevel: meta.riskLevel,
    executionPolicy: meta.executionPolicy,
  }))
}

export function getAvailableToolIds(
  settings: ToolSettings,
  context: ToolContext
): BuiltInToolId[] {
  const availableIds: BuiltInToolId[] = []

  for (const [id, entry] of Object.entries(BUILT_IN_TOOLS) as [BuiltInToolId, ToolEntry][]) {
    // Skip if manually disabled
    if (settings.manuallyDisabledTools.includes(id)) {
      continue
    }

    // Include if manually enabled
    if (settings.manuallyEnabledTools.includes(id)) {
      availableIds.push(id)
      continue
    }

    // Include if enabled by default
    if (entry.enabledByDefault) {
      availableIds.push(id)
      continue
    }

    // Include if conditionally enabled
    if (entry.conditionallyEnabled && entry.conditionallyEnabled(context)) {
      availableIds.push(id)
      continue
    }
  }

  return availableIds
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
