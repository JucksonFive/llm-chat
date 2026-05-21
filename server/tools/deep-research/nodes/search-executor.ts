import { searchSearXNG } from '../web.js'
import type { ResearchState, ResearchStateUpdate, SearchResult } from '../state.js'

const RESULTS_PER_QUERY = 5

/**
 * Search Executor agent. Runs all pending queries in parallel against SearXNG,
 * deduping by URL via the state reducer.
 */
export async function searchExecutorNode(state: ResearchState): Promise<ResearchStateUpdate> {
  // Only search for queries we haven't searched yet — naive heuristic: if we
  // already have search results, run only the newest batch (last 4 queries).
  const queriesToRun = state.searchResults.length === 0
    ? state.queries
    : state.queries.slice(-4)

  const settled = await Promise.allSettled(
    queriesToRun.map((q) => searchSearXNG(q, RESULTS_PER_QUERY)),
  )

  const newResults: SearchResult[] = []
  const errors: string[] = []
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status === 'fulfilled') {
      for (const r of s.value) {
        if (r.url) newResults.push(r)
      }
    } else {
      errors.push(`search "${queriesToRun[i]}": ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`)
    }
  }

  return { searchResults: newResults, errors }
}
