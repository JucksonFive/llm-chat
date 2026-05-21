import crypto from 'node:crypto'
import { tool, jsonSchema } from 'ai'
import { getResearchGraph } from './deep-research/graph.js'
import type { ResearchState } from './deep-research/state.js'

interface DeepResearchInput {
  topic: string
  searchQueries?: string[]
  maxSources?: number
  maxIterations?: number
  threadId?: string
}

interface DeepResearchOutput {
  /** Final Markdown report — the primary content the calling LLM should surface to the user. */
  report: string
  /** Numbered list of sources used for citations in the report. */
  sources: { n: number; title: string; url: string }[]
  /** Thread id for resuming this run later via the checkpointer. */
  threadId: string
  /** Diagnostic metadata; usually not worth quoting back to the user. */
  meta: {
    iterations: number
    sourcesUsed: number
    queries: string[]
    enough: boolean
    missing: string[]
    errors?: string[]
  }
}

/**
 * Build the deep-research tool backed by the LangGraph state machine.
 *
 * The factory pattern matches other LLM-backed tools (web-search, image-gen):
 * an API key is injected once and the resulting tool can be used for many
 * invocations. Each call gets its own `threadId` (auto-generated if not
 * supplied) so the SQLite checkpointer can resume an interrupted run later.
 */
export function createDeepResearchTool(apiKey: string) {
  return tool({
    description:
      'Perform deep, multi-step web research on a topic using a LangGraph state machine. Plans queries, runs parallel SearXNG searches, fetches and analyses sources, loops to refine queries if material is insufficient, then synthesises a Markdown report with [n]-style citations. Returns `{report, sources, threadId, meta}` — present the `report` field verbatim to the user and reference the numbered `sources` list. Treat `meta` as diagnostics only.',
    inputSchema: jsonSchema<DeepResearchInput>({
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The research topic or question.' },
        searchQueries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional starting queries that override the first planner call. The planner will still refine if iterations are needed.',
        },
        maxSources: { type: 'number', description: 'Maximum number of sources to fetch and read (default 8, max 15).' },
        maxIterations: { type: 'number', description: 'Maximum number of plan→search→fetch→analyse loops (default 3, max 5).' },
        threadId: { type: 'string', description: 'Optional thread id for resuming a prior interrupted run via the checkpointer.' },
      },
      required: ['topic'],
    }),
    execute: async (input: DeepResearchInput): Promise<DeepResearchOutput> => {
      const { topic, searchQueries, maxSources = 8, maxIterations = 3, threadId } = input

      const tid = threadId || crypto.randomUUID()
      const graph = getResearchGraph()

      try {
        const initial: Partial<ResearchState> = {
          topic,
          apiKey,
          maxSources: Math.min(Math.max(1, maxSources), 15),
          maxIterations: Math.min(Math.max(1, maxIterations), 5),
        }
        if (searchQueries && searchQueries.length > 0) {
          initial.queries = searchQueries
        }

        const final = (await graph.invoke(initial, {
          configurable: { thread_id: tid },
          recursionLimit: 50,
        })) as ResearchState

        const report =
          final.report?.trim() ||
          final.synthesis?.trim() ||
          `No report was produced for "${topic}". The agent searched ${final.searchResults.length} result(s) and read ${final.sources.length} source(s) over ${final.iteration} iteration(s) but did not gather enough material.`

        return {
          report,
          sources: final.sources.map((s, i) => ({ n: i + 1, title: s.title, url: s.url })),
          threadId: tid,
          meta: {
            iterations: final.iteration,
            sourcesUsed: final.sources.length,
            queries: final.queries,
            enough: final.analysis?.enough ?? false,
            missing: final.analysis?.missing ?? [],
            errors: final.errors.length > 0 ? final.errors : undefined,
          },
        }
      } catch (err) {
        return {
          report: `Deep research failed for "${topic}": ${err instanceof Error ? err.message : String(err)}`,
          sources: [],
          threadId: tid,
          meta: {
            iterations: 0,
            sourcesUsed: 0,
            queries: searchQueries ?? [],
            enough: false,
            missing: [],
            errors: [err instanceof Error ? err.message : 'Deep research failed'],
          },
        }
      }
    },
  })
}

/**
 * Backwards-compatible static export: used when no API key is available.
 * Falls back to a no-op tool that explains the requirement.
 */
export const deepResearchTool = tool({
  description: 'Deep research (LangGraph). Requires an OpenAI API key.',
  inputSchema: jsonSchema<{ topic: string }>({
    type: 'object',
    properties: { topic: { type: 'string' } },
    required: ['topic'],
  }),
  execute: async ({ topic }) => ({
    topic,
    error: 'Deep research requires an OpenAI API key to drive the planner / analyser / synthesiser LLMs. Configure one in settings.',
  }),
})
