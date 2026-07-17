import { webFetchTool } from './web-fetch.js'
import { createWebSearchTool, webSearchTool } from './web-search.js'
import { codeExecutorTool } from './code-executor.js'
import { fileReaderTool, createFileReaderTool } from './file-reader.js'
import { fileWriterTool, createFileWriterTool } from './file-writer.js'
import { calculatorTool } from './calculator.js'
import { pdfReaderTool } from './pdf-reader.js'
import { datetimeTool } from './datetime.js'
import { createImageGeneratorTool } from './image-generator.js'
import { deepResearchTool, createDeepResearchTool } from './deep-research.js'
import { createIndexDocumentTool } from './document-indexer.js'
import { createSearchDocumentTool } from './document-search.js'
import { createPowershellExecutorTool } from './powershell-executor.js'
import type { Tool } from 'ai'

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

export interface ToolContext {
  readonly hasUploadedPdf: boolean
  readonly hasIndexedDocument: boolean
  readonly workspaceAccessEnabled: boolean
  readonly activeProjectId?: string
  readonly permissionProfile?: string
}

export interface ProjectToolContext {
  projectId?: string
  permissionProfile?: string
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
  factory?: (apiKey: string, context?: ProjectToolContext) => Tool | undefined
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
    description: 'Execute JavaScript, Python, or shell code (deprecated — use powershell-executor for project-bound execution)',
    enabledByDefault: false,
    riskLevel: 'destructive',
    executionPolicy: 'approvalRequired',
    tool: codeExecutorTool,
  },
  'powershell-executor': {
    name: 'PowerShell Executor',
    description: 'Execute PowerShell scripts in a sandbox tied to the project workspace (build, test, git, file ops)',
    enabledByDefault: false,
    riskLevel: 'destructive',
    executionPolicy: 'approvalRequired',
    conditionallyEnabled: (ctx) => ctx.workspaceAccessEnabled && !!ctx.activeProjectId,
    factory: (_apiKey: string, context?: ProjectToolContext) =>
      context?.projectId
        ? createPowershellExecutorTool({ projectId: context.projectId, permissionProfile: context.permissionProfile })
        : undefined,
  },
  'file-reader': {
    name: 'File Reader',
    description: 'Read files from the local filesystem',
    enabledByDefault: false,
    riskLevel: 'costly',
    executionPolicy: 'approvalRequired',
    tool: fileReaderTool,
    factory: (_apiKey: string, context?: ProjectToolContext) =>
      createFileReaderTool({ projectId: context?.projectId, permissionProfile: context?.permissionProfile }),
  },
  'file-writer': {
    name: 'File Writer',
    description: 'Write or create files on the filesystem',
    enabledByDefault: false,
    riskLevel: 'destructive',
    executionPolicy: 'approvalRequired',
    tool: fileWriterTool,
    factory: (_apiKey: string, context?: ProjectToolContext) =>
      createFileWriterTool({ projectId: context?.projectId, permissionProfile: context?.permissionProfile }),
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

export function getBuiltInTools(
  enabledIds: BuiltInToolId[],
  apiKey?: string,
  projectContext?: ProjectToolContext,
): Record<string, Tool> {
  const result: Record<string, Tool> = {}
  for (const id of enabledIds) {
    const entry = BUILT_IN_TOOLS[id]
    if (entry) {
      // Resolve the tool. Priority:
      // 1. Factory + API key → full-featured tool (e.g. LLM-rewritten search)
      // 2. Factory + no API key + project context → project-scoped tools
      //    (e.g. powershell-executor) that don't need an API key
      // 3. Factory + API key only → skip (needs API key for LLM features)
      // 4. Static tool instance → always available fallback
      let tool: Tool | undefined
      if (entry.factory && apiKey) {
        tool = entry.factory(apiKey, projectContext)
      } else if (entry.factory && projectContext?.projectId) {
        // Project-scoped tools may not need an API key; pass empty string
        // and let the factory decide based on the project context.
        tool = entry.factory('', projectContext) ?? undefined
      }
      if (!tool) {
        tool = entry.tool
      }
      if (tool) {
        // Tool name must match what we tell the model in the system prompt.
        // AI SDK tool names typically use snake_case; we expose the id as-is
        // with hyphens converted to underscores (e.g. `web-search` -> `web_search`).
        result[id.replace(/-/g, '_')] = tool
      }
    }
  }
  return result
}
