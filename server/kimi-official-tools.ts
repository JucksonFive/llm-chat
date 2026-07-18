import { jsonSchema, tool } from 'ai'
import type { Tool } from 'ai'

const KIMI_API_BASE_URL = 'https://api.moonshot.ai/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export const KIMI_OFFICIAL_TOOL_CATALOG = [
  {
    id: 'kimi-web-search',
    name: 'Web Search',
    description: 'Search the web with Kimi for current, source-backed information',
    formulaUri: 'moonshot/web-search:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-rethink',
    name: 'Rethink',
    description: 'Organize ideas and reconsider a problem with Kimi reasoning',
    formulaUri: 'moonshot/rethink:latest',
    riskLevel: 'safe',
  },
  {
    id: 'kimi-memory',
    name: 'Memory',
    description: 'Store and retrieve persistent conversation history and preferences',
    formulaUri: 'moonshot/memory:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-code-runner',
    name: 'Code Runner',
    description: 'Execute Python code in Kimi Formula',
    formulaUri: 'moonshot/code_runner:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-date',
    name: 'Date',
    description: 'Process dates, times, timezones, and date calculations',
    formulaUri: 'moonshot/date:latest',
    riskLevel: 'safe',
  },
  {
    id: 'kimi-convert',
    name: 'Convert',
    description: 'Convert units and currencies',
    formulaUri: 'moonshot/convert:latest',
    riskLevel: 'safe',
  },
  {
    id: 'kimi-random-choice',
    name: 'Random Choice',
    description: 'Make a random selection from the provided choices',
    formulaUri: 'moonshot/random-choice:latest',
    riskLevel: 'safe',
  },
  {
    id: 'kimi-excel',
    name: 'Excel',
    description: 'Analyze Excel and CSV data with Kimi Formula',
    formulaUri: 'moonshot/excel:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-quickjs',
    name: 'Quick JS',
    description: 'Execute JavaScript safely with the QuickJS engine',
    formulaUri: 'moonshot/quickjs:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-fetch',
    name: 'Fetch',
    description: 'Extract URL content and return it as Markdown',
    formulaUri: 'moonshot/fetch:latest',
    riskLevel: 'costly',
  },
  {
    id: 'kimi-base64',
    name: 'Base64',
    description: 'Encode and decode Base64 content',
    formulaUri: 'moonshot/base64:latest',
    riskLevel: 'safe',
  },
] as const

export type KimiOfficialToolId = (typeof KIMI_OFFICIAL_TOOL_CATALOG)[number]['id']

interface FormulaFunction {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

interface FormulaToolDefinition {
  type: string
  function?: FormulaFunction
}

interface FormulaToolsResponse {
  tools?: FormulaToolDefinition[]
}

interface FormulaFiberContext {
  output?: unknown
  encrypted_output?: unknown
  error?: unknown
}

interface FormulaFiberResponse {
  id?: string
  status?: string
  error?: unknown
  context?: FormulaFiberContext
}

export interface KimiOfficialToolOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  requestTimeoutMs?: number
}

const catalogById = new Map(
  KIMI_OFFICIAL_TOOL_CATALOG.map((entry) => [entry.id, entry] as const),
)

export function isKimiOfficialToolId(id: string): id is KimiOfficialToolId {
  return catalogById.has(id as KimiOfficialToolId)
}

function errorMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return 'Unknown error'

  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string') return record.message
  if (typeof record.error === 'string') return record.error
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>
    if (typeof nested.message === 'string') return nested.message
  }

  return JSON.stringify(payload).slice(0, 500)
}

async function requestJson(
  url: string,
  apiKey: string,
  options: KimiOfficialToolOptions,
  init?: RequestInit,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (init?.body) headers.set('Content-Type', 'application/json')

  const response = await fetchImpl(url, {
    ...init,
    headers,
    signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
  })

  const raw = await response.text()
  let payload: unknown = {}
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = raw
    }
  }

  if (!response.ok) {
    throw new Error(`Kimi Formula request failed (${response.status}): ${errorMessage(payload)}`)
  }

  return payload
}

async function loadFormulaDefinitions(
  formulaUri: string,
  apiKey: string,
  options: KimiOfficialToolOptions,
): Promise<Array<FormulaToolDefinition & { function: FormulaFunction }>> {
  const baseUrl = (options.baseUrl ?? KIMI_API_BASE_URL).replace(/\/$/, '')
  const payload = await requestJson(
    `${baseUrl}/formulas/${formulaUri}/tools`,
    apiKey,
    options,
  ) as FormulaToolsResponse

  if (!Array.isArray(payload.tools)) {
    throw new Error(`Kimi Formula ${formulaUri} returned no tool definitions`)
  }

  return payload.tools.filter(
    (definition): definition is FormulaToolDefinition & { function: FormulaFunction } =>
      definition.type === 'function' &&
      typeof definition.function?.name === 'string' &&
      definition.function.name.length > 0,
  )
}

async function executeFormula(
  formulaUri: string,
  functionName: string,
  args: Record<string, unknown>,
  apiKey: string,
  options: KimiOfficialToolOptions,
): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? KIMI_API_BASE_URL).replace(/\/$/, '')
  const payload = await requestJson(
    `${baseUrl}/formulas/${formulaUri}/fibers`,
    apiKey,
    options,
    {
      method: 'POST',
      body: JSON.stringify({
        name: functionName,
        arguments: JSON.stringify(args),
      }),
    },
  ) as FormulaFiberResponse

  const context = payload.context ?? {}
  if (payload.status === 'succeeded') {
    if (context.output !== undefined) return context.output
    if (context.encrypted_output !== undefined) return context.encrypted_output
    return ''
  }

  throw new Error(
    `Kimi Formula ${formulaUri} failed: ${errorMessage(
      payload.error ?? context.error ?? context.output ?? payload,
    )}`,
  )
}

function exposedToolName(functionName: string): string {
  return `kimi_${functionName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export async function buildKimiOfficialTools(
  enabledIds: readonly string[],
  apiKey: string,
  options: KimiOfficialToolOptions = {},
): Promise<Record<string, Tool>> {
  const selectedIds = [...new Set(enabledIds.filter(isKimiOfficialToolId))]
  if (selectedIds.length === 0) return {}
  if (!apiKey) throw new Error('A Kimi API key is required for Kimi Official Tools')

  const definitionsByFormula = await Promise.all(
    selectedIds.map(async (id) => {
      const catalogEntry = catalogById.get(id)!
      const definitions = await loadFormulaDefinitions(catalogEntry.formulaUri, apiKey, options)
      return { catalogEntry, definitions }
    }),
  )

  const result: Record<string, Tool> = {}
  for (const { catalogEntry, definitions } of definitionsByFormula) {
    for (const definition of definitions) {
      const formulaFunction = definition.function
      const toolName = exposedToolName(formulaFunction.name)
      if (result[toolName]) {
        throw new Error(`Duplicate Kimi Official Tool function: ${formulaFunction.name}`)
      }

      result[toolName] = tool({
        description: formulaFunction.description ?? catalogEntry.description,
        inputSchema: jsonSchema<Record<string, unknown>>(
          (formulaFunction.parameters ?? { type: 'object', properties: {} }) as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (args) => executeFormula(
          catalogEntry.formulaUri,
          formulaFunction.name,
          args,
          apiKey,
          options,
        ),
      })
    }
  }

  return result
}