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
  topic: string
  threadId: string
  iterations: number
  queriesUsed: string[]
  sourcesFound: number
  sourcesRead: number
  sources: { title: string; url: string }[]
  analysis?: { enough: boolean; missing: string[]; notes: string }
  synthesis?: string
  report?: string
  errors?: string[]
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
      'Perform deep, multi-step web research on a topic using a LangGraph state machine. The graph plans queries, executes parallel SearXNG searches, fetches and analyses sources, loops back to refine queries if material is insufficient (up to maxIterations), then synthesises and formats a Markdown report with citations. Use this for non-trivial research that benefits from iteration and reflection.',
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

        return {
          topic: final.topic,
          threadId: tid,
          iterations: final.iteration,
          queriesUsed: final.queries,
          sourcesFound: final.searchResults.length,
          sourcesRead: final.sources.length,
          sources: final.sources.map((s) => ({ title: s.title, url: s.url })),
          analysis: final.analysis,
          synthesis: final.synthesis,
          report: final.report,
          errors: final.errors.length > 0 ? final.errors : undefined,
        }
      } catch (err) {
        return {
          topic,
          threadId: tid,
          iterations: 0,
          queriesUsed: searchQueries ?? [],
          sourcesFound: 0,
          sourcesRead: 0,
          sources: [],
          errors: [err instanceof Error ? err.message : 'Deep research failed'],
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
