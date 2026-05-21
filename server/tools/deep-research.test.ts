import { describe, it, expect, vi, beforeEach } from 'vitest'

const plannerInvoke = vi.fn()
const analyzerInvoke = vi.fn()
const synthesizerInvoke = vi.fn()
const reporterInvoke = vi.fn()
const withStructuredOutput = vi.fn()

vi.mock('@langchain/openai', () => {
  class ChatOpenAI {
    private readonly model: string
    constructor(opts: { model: string }) {
      this.model = opts.model
    }
    withStructuredOutput = () => {
      // Return an object whose invoke fn matches the LLM role inferred from
      // the model name (we use one model per role in tests).
      const role = this.model
      const invoke = role.includes('planner')
        ? plannerInvoke
        : role.includes('analyzer')
          ? analyzerInvoke
          : role.includes('synthesizer')
            ? synthesizerInvoke
            : reporterInvoke
      withStructuredOutput()
      return { invoke }
    }
    invoke = () => {
      const role = this.model
      const invoke = role.includes('synthesizer')
        ? synthesizerInvoke
        : role.includes('reporter')
          ? reporterInvoke
          : plannerInvoke
      return invoke()
    }
  }
  return { ChatOpenAI }
})

// Mock SearXNG + page fetcher so the test does not touch the network.
const searchSearXNG = vi.fn()
const fetchPageContent = vi.fn()
vi.mock('./deep-research/web.js', () => ({
  searchSearXNG: (q: string, n: number) => searchSearXNG(q, n),
  fetchPageContent: (u: string) => fetchPageContent(u),
}))

// Force each test to set its own model env vars so the role-routing logic
// above maps invocations to the correct fn.
process.env.DEEP_RESEARCH_PLANNER_MODEL = 'mock-planner'
process.env.DEEP_RESEARCH_ANALYZER_MODEL = 'mock-analyzer'
process.env.DEEP_RESEARCH_SYNTHESIZER_MODEL = 'mock-synthesizer'
process.env.DEEP_RESEARCH_REPORTER_MODEL = 'mock-reporter'

const { buildResearchGraphForTesting } = await import('./deep-research/graph.js')
const { shouldRefine } = await import('./deep-research/nodes/analysis.js')

beforeEach(() => {
  plannerInvoke.mockReset()
  analyzerInvoke.mockReset()
  synthesizerInvoke.mockReset()
  reporterInvoke.mockReset()
  withStructuredOutput.mockClear()
  searchSearXNG.mockReset()
  fetchPageContent.mockReset()
})

describe('shouldRefine (conditional edge)', () => {
  const base = {
    topic: 't',
    apiKey: 'k',
    maxSources: 8,
    maxIterations: 3,
    iteration: 1,
    queries: [],
    searchResults: [],
    sources: [],
    errors: [],
  } as unknown as Parameters<typeof shouldRefine>[0]

  it('routes to synthesize when analysis is missing', () => {
    expect(shouldRefine(base)).toBe('synthesize')
  })

  it('routes to synthesize when analysis.enough is true', () => {
    expect(
      shouldRefine({ ...base, analysis: { enough: true, missing: [], notes: '' } }),
    ).toBe('synthesize')
  })

  it('routes to plan_queries when not enough and iteration cap not reached', () => {
    expect(
      shouldRefine({
        ...base,
        iteration: 1,
        maxIterations: 3,
        analysis: { enough: false, missing: ['x'], notes: '' },
      }),
    ).toBe('plan_queries')
  })

  it('routes to synthesize when iteration cap reached even if not enough', () => {
    expect(
      shouldRefine({
        ...base,
        iteration: 3,
        maxIterations: 3,
        analysis: { enough: false, missing: ['x'], notes: '' },
      }),
    ).toBe('synthesize')
  })
})

describe('Research graph end-to-end (happy path)', () => {
  it('plans → searches → fetches → analyses (enough) → synthesises → reports', async () => {
    plannerInvoke.mockResolvedValue({ queries: ['why is the sky blue', 'rayleigh scattering'] })
    searchSearXNG.mockResolvedValue([
      { url: 'https://example.com/a', title: 'A', snippet: '' },
      { url: 'https://example.com/b', title: 'B', snippet: '' },
    ])
    fetchPageContent.mockResolvedValue('a very long detailed explanation of rayleigh scattering '.repeat(20))
    analyzerInvoke.mockResolvedValue({ enough: true, missing: [], notes: 'enough breadth' })
    synthesizerInvoke.mockResolvedValue({ content: 'The sky is blue because of Rayleigh scattering [1].' })
    reporterInvoke.mockResolvedValue({ content: '## Why the sky is blue\n\nRayleigh scattering [1].\n\n### Sources\n1. A' })

    const graph = buildResearchGraphForTesting()
    const result = (await graph.invoke({
      topic: 'why is the sky blue',
      apiKey: 'sk-test',
      maxIterations: 3,
      maxSources: 5,
    })) as {
      topic: string
      iteration: number
      queries: string[]
      sources: { url: string }[]
      analysis?: { enough: boolean }
      synthesis?: string
      report?: string
    }

    expect(result.topic).toBe('why is the sky blue')
    expect(result.iteration).toBe(1)
    // Planner queries plus the topic (added in plan-queries.ts on iteration 0).
    expect(result.queries).toContain('why is the sky blue')
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.analysis?.enough).toBe(true)
    expect(result.synthesis).toContain('Rayleigh')
    expect(result.report).toContain('Why the sky is blue')

    // Each downstream LLM was called exactly once.
    expect(plannerInvoke).toHaveBeenCalledTimes(1)
    expect(analyzerInvoke).toHaveBeenCalledTimes(1)
    expect(synthesizerInvoke).toHaveBeenCalledTimes(1)
    expect(reporterInvoke).toHaveBeenCalledTimes(1)
  })
})

describe('Research graph refinement loop', () => {
  it('loops back to plan_queries when analysis says not enough', async () => {
    plannerInvoke
      .mockResolvedValueOnce({ queries: ['q1'] })
      .mockResolvedValueOnce({ queries: ['q2-refined'] })
    searchSearXNG.mockResolvedValue([
      { url: 'https://example.com/p', title: 'P', snippet: '' },
    ])
    fetchPageContent.mockResolvedValue('useful content '.repeat(50))
    analyzerInvoke
      .mockResolvedValueOnce({ enough: false, missing: ['historical context'], notes: 'thin' })
      .mockResolvedValueOnce({ enough: true, missing: [], notes: 'good enough now' })
    synthesizerInvoke.mockResolvedValue({ content: 'synthesised' })
    reporterInvoke.mockResolvedValue({ content: 'final report' })

    const graph = buildResearchGraphForTesting()
    const result = (await graph.invoke({
      topic: 'edge case test',
      apiKey: 'sk-test',
      maxIterations: 3,
      maxSources: 5,
    })) as { iteration: number; report?: string }

    expect(plannerInvoke).toHaveBeenCalledTimes(2)
    expect(analyzerInvoke).toHaveBeenCalledTimes(2)
    expect(result.iteration).toBe(2)
    expect(result.report).toBe('final report')
  })

  it('stops at maxIterations even when analyzer keeps saying not enough', async () => {
    plannerInvoke.mockResolvedValue({ queries: ['q'] })
    searchSearXNG.mockResolvedValue([{ url: 'https://e.com/p', title: 'P', snippet: '' }])
    fetchPageContent.mockResolvedValue('content '.repeat(50))
    analyzerInvoke.mockResolvedValue({ enough: false, missing: ['more'], notes: 'never enough' })
    synthesizerInvoke.mockResolvedValue({ content: 's' })
    reporterInvoke.mockResolvedValue({ content: 'r' })

    const graph = buildResearchGraphForTesting()
    const result = (await graph.invoke({
      topic: 'hard topic',
      apiKey: 'sk-test',
      maxIterations: 2,
      maxSources: 5,
    })) as { iteration: number; report?: string }

    expect(plannerInvoke).toHaveBeenCalledTimes(2)
    expect(analyzerInvoke).toHaveBeenCalledTimes(2)
    expect(result.iteration).toBe(2)
    expect(result.report).toBe('r')
  })
})

describe('Research graph error handling', () => {
  it('still produces a (degraded) report when planner fails', async () => {
    plannerInvoke.mockRejectedValue(new Error('rate limit'))
    searchSearXNG.mockResolvedValue([{ url: 'https://e.com/p', title: 'P', snippet: '' }])
    fetchPageContent.mockResolvedValue('content '.repeat(50))
    analyzerInvoke.mockResolvedValue({ enough: true, missing: [], notes: '' })
    synthesizerInvoke.mockResolvedValue({ content: 's' })
    reporterInvoke.mockResolvedValue({ content: 'r' })

    const graph = buildResearchGraphForTesting()
    const result = (await graph.invoke({
      topic: 'recover',
      apiKey: 'sk-test',
      maxIterations: 1,
      maxSources: 5,
    })) as { errors: string[]; report?: string; queries: string[] }

    expect(result.errors.some((e) => e.startsWith('plan_queries'))).toBe(true)
    // Falls back to the bare topic + overview/latest queries.
    expect(result.queries.length).toBeGreaterThan(0)
    expect(result.report).toBe('r')
  })

  it('returns an empty-source report when fetcher returns nothing', async () => {
    plannerInvoke.mockResolvedValue({ queries: ['q'] })
    searchSearXNG.mockResolvedValue([{ url: 'https://e.com/p', title: 'P', snippet: '' }])
    fetchPageContent.mockResolvedValue('') // too short → dropped
    analyzerInvoke.mockResolvedValue({ enough: true, missing: [], notes: 'forced enough' })
    // Synthesis node has its own no-sources branch so synthesizer is NOT invoked.
    reporterInvoke.mockResolvedValue({ content: 'empty report' })

    const graph = buildResearchGraphForTesting()
    const result = (await graph.invoke({
      topic: 'no data topic',
      apiKey: 'sk-test',
      maxIterations: 1,
      maxSources: 5,
    })) as { sources: unknown[]; synthesis?: string; report?: string }

    expect(result.sources).toHaveLength(0)
    expect(result.synthesis).toContain('No sources')
    expect(synthesizerInvoke).not.toHaveBeenCalled()
    expect(result.report).toBe('empty report')
  })
})
