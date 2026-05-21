import { ChatOpenAI } from '@langchain/openai'

const PLANNER_MODEL = process.env.DEEP_RESEARCH_PLANNER_MODEL || 'gpt-4.1-mini'
const ANALYZER_MODEL = process.env.DEEP_RESEARCH_ANALYZER_MODEL || 'gpt-4.1-mini'
const SYNTHESIZER_MODEL = process.env.DEEP_RESEARCH_SYNTHESIZER_MODEL || 'gpt-4.1-mini'
const REPORTER_MODEL = process.env.DEEP_RESEARCH_REPORTER_MODEL || 'gpt-4.1-mini'

const clientCache = new Map<string, ChatOpenAI>()

function key(apiKey: string, model: string) {
  // Cheap, non-cryptographic — we only need stable map keys per (apiKey, model).
  // Real cache safety comes from never logging this value.
  return `${model}:${apiKey.slice(0, 8)}:${apiKey.length}`
}

export function getPlannerLLM(apiKey: string) {
  const k = key(apiKey, PLANNER_MODEL)
  const cached = clientCache.get(k)
  if (cached) return cached
  const llm = new ChatOpenAI({ apiKey, model: PLANNER_MODEL, temperature: 0.4 })
  clientCache.set(k, llm)
  return llm
}

export function getAnalyzerLLM(apiKey: string) {
  const k = key(apiKey, ANALYZER_MODEL)
  const cached = clientCache.get(k)
  if (cached) return cached
  const llm = new ChatOpenAI({ apiKey, model: ANALYZER_MODEL, temperature: 0.1 })
  clientCache.set(k, llm)
  return llm
}

export function getSynthesizerLLM(apiKey: string) {
  const k = key(apiKey, SYNTHESIZER_MODEL)
  const cached = clientCache.get(k)
  if (cached) return cached
  const llm = new ChatOpenAI({ apiKey, model: SYNTHESIZER_MODEL, temperature: 0.2 })
  clientCache.set(k, llm)
  return llm
}

export function getReporterLLM(apiKey: string) {
  const k = key(apiKey, REPORTER_MODEL)
  const cached = clientCache.get(k)
  if (cached) return cached
  const llm = new ChatOpenAI({ apiKey, model: REPORTER_MODEL, temperature: 0.3 })
  clientCache.set(k, llm)
  return llm
}
