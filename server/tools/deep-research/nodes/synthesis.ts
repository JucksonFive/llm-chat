import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getSynthesizerLLM } from '../llm.js'
import type { ResearchState, ResearchStateUpdate } from '../state.js'

const SYSTEM = `You are a research synthesist. Given a topic and a numbered list of source documents, produce a single coherent synthesis that:
- Captures the most important factual claims found in the sources.
- Notes disagreements between sources when present.
- Cites every non-trivial claim using bracketed source numbers like [1] or [2,3].
- Omits unsupported speculation.
- Stays under ~600 words.`

const SOURCE_BUDGET_CHARS = 6_000

function pack(state: ResearchState): string {
  return state.sources
    .map((s, i) => {
      const body = s.content.length > SOURCE_BUDGET_CHARS
        ? s.content.slice(0, SOURCE_BUDGET_CHARS) + '… [truncated]'
        : s.content
      return `--- Source ${i + 1}: ${s.title} ---\nURL: ${s.url}\n\n${body}`
    })
    .join('\n\n')
}

/**
 * Synthesis agent. Produces a citation-bearing synthesis of the gathered
 * sources. The output is consumed by the Report Generator.
 */
export async function synthesisNode(state: ResearchState): Promise<ResearchStateUpdate> {
  if (state.sources.length === 0) {
    return {
      synthesis: `No sources were successfully fetched for topic: ${state.topic}. The research process could not gather material to synthesise.`,
    }
  }

  const llm = getSynthesizerLLM(state.apiKey)
  try {
    const result = await llm.invoke([
      new SystemMessage(SYSTEM),
      new HumanMessage(`Topic: ${state.topic}\n\nSources:\n\n${pack(state)}`),
    ])
    const text = typeof result.content === 'string'
      ? result.content
      : Array.isArray(result.content)
        ? result.content.map((p) => (typeof p === 'string' ? p : 'text' in p ? String(p.text) : '')).join('')
        : ''
    return { synthesis: text.trim() }
  } catch (err) {
    return {
      synthesis: `Synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
      errors: [`synthesis: ${err instanceof Error ? err.message : String(err)}`],
    }
  }
}
