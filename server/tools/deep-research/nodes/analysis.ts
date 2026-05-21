import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getAnalyzerLLM } from '../llm.js'
import type { Analysis, ResearchState, ResearchStateUpdate } from '../state.js'

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    enough: {
      type: 'boolean',
      description: 'True if the gathered sources contain enough information to write a comprehensive answer to the topic.',
    },
    missing: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific aspects or sub-questions that the current sources fail to cover (empty if enough=true).',
    },
    notes: {
      type: 'string',
      description: 'One or two sentence reasoning for the verdict, to be passed to the planner if a refinement loop is needed.',
    },
  },
  required: ['enough', 'missing', 'notes'],
  additionalProperties: false,
} as const

const SYSTEM = `You are a research analyst. You are given a topic and a list of short source summaries. Decide whether the sources collectively contain enough breadth and depth to write a thorough answer. If not, list the SPECIFIC missing aspects so a planner can craft new queries. Be strict — better to do one more iteration than to synthesize from thin material.`

function sourceSummary(state: ResearchState): string {
  if (state.sources.length === 0) return '(no sources fetched)'
  return state.sources
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}\n   ${s.content.slice(0, 400).replace(/\s+/g, ' ').trim()}…`)
    .join('\n\n')
}

/**
 * Analysis agent. Inspects gathered sources and decides whether the research
 * graph should loop back to plan_queries for more material or proceed to
 * synthesis.
 */
export async function analysisNode(state: ResearchState): Promise<ResearchStateUpdate> {
  // Always force one more iteration if we have basically nothing.
  if (state.sources.length === 0 && state.iteration < state.maxIterations) {
    const analysis: Analysis = {
      enough: false,
      missing: ['No usable sources were fetched — broaden the queries.'],
      notes: 'Source pool empty, refinement required.',
    }
    return { analysis }
  }

  const llm = getAnalyzerLLM(state.apiKey)
  try {
    const structured = llm.withStructuredOutput<Analysis>(ANALYSIS_SCHEMA, {
      name: 'analysis',
    })
    const result = await structured.invoke([
      new SystemMessage(SYSTEM),
      new HumanMessage(`Topic: ${state.topic}\n\nIteration: ${state.iteration} of ${state.maxIterations}\n\nSources (${state.sources.length}):\n\n${sourceSummary(state)}`),
    ])
    return { analysis: result }
  } catch (err) {
    // On analyzer failure, assume enough so we still produce some output.
    const analysis: Analysis = {
      enough: true,
      missing: [],
      notes: `Analyzer failed (${err instanceof Error ? err.message : String(err)}) — proceeding to synthesis.`,
    }
    return {
      analysis,
      errors: [`analysis: ${err instanceof Error ? err.message : String(err)}`],
    }
  }
}

/**
 * Conditional edge function: decides whether to loop or move on.
 */
export function shouldRefine(state: ResearchState): 'plan_queries' | 'synthesize' {
  if (!state.analysis) return 'synthesize'
  if (state.analysis.enough) return 'synthesize'
  if (state.iteration >= state.maxIterations) return 'synthesize'
  return 'plan_queries'
}
