import { END, START, StateGraph } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { ResearchStateAnnotation } from './state.js'
import { planQueriesNode } from './nodes/plan-queries.js'
import { searchExecutorNode } from './nodes/search-executor.js'
import { contentFetcherNode } from './nodes/content-fetcher.js'
import { analysisNode, shouldRefine } from './nodes/analysis.js'
import { synthesisNode } from './nodes/synthesis.js'
import { reportNode } from './nodes/report.js'
import { getResearchCheckpointer } from './checkpointer.js'

function buildGraphBase() {
  return new StateGraph(ResearchStateAnnotation)
    .addNode('plan_queries', planQueriesNode)
    .addNode('search', searchExecutorNode)
    .addNode('fetch', contentFetcherNode)
    .addNode('analyze', analysisNode)
    .addNode('synthesize', synthesisNode)
    .addNode('format_report', reportNode)
    .addEdge(START, 'plan_queries')
    .addEdge('plan_queries', 'search')
    .addEdge('search', 'fetch')
    .addEdge('fetch', 'analyze')
    .addConditionalEdges('analyze', shouldRefine, {
      plan_queries: 'plan_queries',
      synthesize: 'synthesize',
    })
    .addEdge('synthesize', 'format_report')
    .addEdge('format_report', END)
}

type CompiledResearchGraph = ReturnType<ReturnType<typeof buildGraphBase>['compile']>

let compiledGraph: CompiledResearchGraph | undefined

/**
 * Build (and cache) the compiled deep-research state graph.
 *
 *   plan_queries → search → fetch → analysis
 *                                      │
 *                          enough? ──no──→ plan_queries (loop, max maxIterations)
 *                              │ yes
 *                          synthesize → report → END
 */
export function getResearchGraph() {
  if (!compiledGraph) {
    compiledGraph = buildGraphBase().compile({ checkpointer: getResearchCheckpointer() })
  }
  return compiledGraph
}

/**
 * Test-only: build a graph without the production SQLite checkpointer.
 * Optionally pass a `MemorySaver` (or any `BaseCheckpointSaver`) for tests
 * that need to inspect checkpoint behaviour.
 */
export function buildResearchGraphForTesting(checkpointer?: BaseCheckpointSaver) {
  const base = buildGraphBase()
  return base.compile(checkpointer ? { checkpointer } : undefined)
}
