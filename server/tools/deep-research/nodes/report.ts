import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getReporterLLM } from '../llm.js'
import type { ResearchState, ResearchStateUpdate } from '../state.js'

const SYSTEM = `You are a research report formatter. Given a research synthesis and the underlying source list, produce a clean, well-structured Markdown report with:
1. A short executive summary (2–3 sentences).
2. The main synthesis content with citations preserved as [n].
3. A "Sources" section listing each numbered source with its title and URL.
Do not invent new facts beyond what the synthesis contains.`

function sourceList(state: ResearchState): string {
  return state.sources.map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`).join('\n')
}

/**
 * Report Generator agent. Formats the synthesis into a polished Markdown
 * report consumable by the chat UI. If the underlying LLM call fails we fall
 * back to a deterministic plain-Markdown wrap so the tool always returns
 * something useful.
 */
export async function reportNode(state: ResearchState): Promise<ResearchStateUpdate> {
  const synthesis = state.synthesis ?? ''
  const sources = sourceList(state)

  const llm = getReporterLLM(state.apiKey)
  try {
    const result = await llm.invoke([
      new SystemMessage(SYSTEM),
      new HumanMessage(`Topic: ${state.topic}\n\nSynthesis:\n${synthesis}\n\nSource list (use these in the Sources section):\n${sources}`),
    ])
    const text = typeof result.content === 'string'
      ? result.content
      : Array.isArray(result.content)
        ? result.content.map((p) => (typeof p === 'string' ? p : 'text' in p ? String(p.text) : '')).join('')
        : ''
    return { report: text.trim() }
  } catch (err) {
    // Fallback: deterministic report so the user still gets a useful response.
    const fallback = `## Research: ${state.topic}\n\n${synthesis}\n\n### Sources\n\n${sources}`
    return {
      report: fallback,
      errors: [`report: ${err instanceof Error ? err.message : String(err)}`],
    }
  }
}
