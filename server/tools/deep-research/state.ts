import { Annotation } from '@langchain/langgraph'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface Source {
  title: string
  url: string
  content: string
}

export interface Analysis {
  enough: boolean
  missing: string[]
  notes: string
}

/**
 * State for the deep-research LangGraph state machine.
 *
 * Reducers:
 * - `queries`, `searchResults`, `sources` use an append-and-dedup reducer so
 *   nodes can return partial updates (e.g. refine_queries adds new queries
 *   without overwriting earlier ones).
 */
export const ResearchStateAnnotation = Annotation.Root({
  topic: Annotation<string>(),
  apiKey: Annotation<string>(),
  maxSources: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 8,
  }),
  maxIterations: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 3,
  }),
  iteration: Annotation<number>({
    reducer: (a, b) => (b !== undefined ? b : a),
    default: () => 0,
  }),
  queries: Annotation<string[]>({
    reducer: (a, b) => {
      const seen = new Set(a)
      const merged = [...a]
      for (const q of b) {
        const key = q.trim().toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(q.trim())
        }
      }
      return merged
    },
    default: () => [],
  }),
  searchResults: Annotation<SearchResult[]>({
    reducer: (a, b) => {
      const seen = new Set(a.map((r) => r.url))
      const merged = [...a]
      for (const r of b) {
        if (!seen.has(r.url)) {
          seen.add(r.url)
          merged.push(r)
        }
      }
      return merged
    },
    default: () => [],
  }),
  sources: Annotation<Source[]>({
    reducer: (a, b) => {
      const seen = new Set(a.map((s) => s.url))
      const merged = [...a]
      for (const s of b) {
        if (!seen.has(s.url)) {
          seen.add(s.url)
          merged.push(s)
        }
      }
      return merged
    },
    default: () => [],
  }),
  analysis: Annotation<Analysis | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  synthesis: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  report: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
})

export type ResearchState = typeof ResearchStateAnnotation.State
export type ResearchStateUpdate = typeof ResearchStateAnnotation.Update
