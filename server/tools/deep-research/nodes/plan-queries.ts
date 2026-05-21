import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getPlannerLLM } from '../llm.js'
import type { ResearchState, ResearchStateUpdate } from '../state.js'

const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 6,
      description: 'Distinct search queries that approach the topic from different angles.',
    },
  },
  required: ['queries'],
  additionalProperties: false,
} as const

const SYSTEM = `You are a research planner. Given a topic, produce 4–6 high-quality web search queries that approach the topic from clearly different angles (definitions, current state, comparisons, criticisms, recent developments). Each query must be a self-contained search string under 12 words.`

const REFINE_SYSTEM = `You are a research planner refining a prior search. The previous queries did not surface enough information. Produce 3–4 new, complementary search queries that target the missing aspects listed by the analyst. Do NOT repeat earlier queries verbatim.`

/**
 * Query Planner agent. Generates queries for the topic, or refines them on
 * subsequent iterations using analyst feedback.
 */
export async function planQueriesNode(state: ResearchState): Promise<ResearchStateUpdate> {
  const llm = getPlannerLLM(state.apiKey)
  const isRefine = state.iteration > 0 && state.analysis && !state.analysis.enough

  const messages = isRefine
    ? [
        new SystemMessage(REFINE_SYSTEM),
        new HumanMessage(
          `Topic: ${state.topic}\n\nPrior queries:\n${state.queries.map((q) => `- ${q}`).join('\n')}\n\nMissing aspects (from analyst):\n${state.analysis!.missing.map((m) => `- ${m}`).join('\n')}\n\nAnalyst notes: ${state.analysis!.notes}`,
        ),
      ]
    : [new SystemMessage(SYSTEM), new HumanMessage(`Topic: ${state.topic}`)]

  try {
    const structured = llm.withStructuredOutput<{ queries: string[] }>(QUERY_SCHEMA, {
      name: 'plan_queries',
    })
    const result = await structured.invoke(messages)
    const cleaned = (result.queries ?? [])
      .map((q) => q.trim())
      .filter((q) => q.length > 0)

    // On the very first iteration, always include the bare topic as a fallback query.
    const queries = state.iteration === 0 ? [state.topic, ...cleaned] : cleaned

    return { queries, iteration: state.iteration + 1 }
  } catch (err) {
    return {
      queries: state.iteration === 0 ? [state.topic, `${state.topic} overview`, `${state.topic} latest`] : [],
      iteration: state.iteration + 1,
      errors: [`plan_queries: ${err instanceof Error ? err.message : String(err)}`],
    }
  }
}
