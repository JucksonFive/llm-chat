import { fetchPageContent } from '../web.js'
import type { ResearchState, ResearchStateUpdate, Source } from '../state.js'

const MIN_CONTENT_LENGTH = 100
const FETCH_CONCURRENCY = 6

/**
 * Content Fetcher agent. Fetches the top unread search results in parallel,
 * up to the `maxSources` budget. Pages already fetched (tracked via state.sources)
 * are skipped so refinement iterations only fetch new URLs.
 */
export async function contentFetcherNode(state: ResearchState): Promise<ResearchStateUpdate> {
  const alreadyFetched = new Set(state.sources.map((s) => s.url))
  const remainingBudget = Math.max(0, state.maxSources - state.sources.length)
  if (remainingBudget === 0) return {}

  // Prioritise newest, deduped results not yet fetched.
  const candidates = state.searchResults
    .filter((r) => !alreadyFetched.has(r.url))
    .slice(0, remainingBudget)

  if (candidates.length === 0) return {}

  // Bounded parallelism via simple chunked Promise.all
  const newSources: Source[] = []
  const errors: string[] = []

  for (let i = 0; i < candidates.length; i += FETCH_CONCURRENCY) {
    const chunk = candidates.slice(i, i + FETCH_CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map(async (c) => {
        const content = await fetchPageContent(c.url)
        return { c, content }
      }),
    )
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        const { c, content } = s.value
        if (content.length >= MIN_CONTENT_LENGTH) {
          newSources.push({ title: c.title, url: c.url, content })
        }
      } else {
        errors.push(`fetch: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`)
      }
    }
  }

  return { sources: newSources, errors }
}
