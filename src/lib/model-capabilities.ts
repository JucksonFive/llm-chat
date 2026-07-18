/**
 * Detects model capabilities from model name patterns.
 * Used to display badges and indicators in the UI.
 */

export interface ModelCapabilities {
  reasoning: boolean
  vision: boolean
  largeContext: boolean
  contextSize?: string
}

const REASONING_PATTERNS = [
  /\bo[1-9]\b/i,           // OpenAI o1, o3, o5
  /\bo[1-9]-/i,            // o1-mini, o3-pro
  /thinking/i,             // claude-3-5-sonnet-thinking
  /reason/i,               // deepseek-reasoner
  /-r1\b/i,                // deepseek-r1
  /-r[2-9]\b/i,            // deepseek-r2
  /reflection/i,           // reflection models
  /^kimi-k(?:3|2\.(?:6|7))/i, // current Kimi reasoning models
]

const VISION_PATTERNS = [
  /vision/i,               // gpt-4-vision
  /vl\b/i,                 // qwen-vl
  /-v\b/i,                 // some vision variants
  /gpt-4o/i,               // gpt-4o (multimodal)
  /gpt-4-turbo/i,          // gpt-4-turbo (multimodal)
  /claude-3/i,             // claude-3+ has vision
  /claude-opus/i,
  /claude-sonnet/i,
  /claude-haiku/i,
  /gemini/i,               // gemini models have vision
  /llava/i,                // llava
  /pixtral/i,              // mistral pixtral
  /^kimi-k(?:3|2\.(?:6|7))/i, // current Kimi multimodal models
]

const LARGE_CONTEXT_MAP: Array<{ pattern: RegExp; size: string }> = [
  { pattern: /claude-3/i, size: '200K' },
  { pattern: /claude-opus/i, size: '200K' },
  { pattern: /claude-sonnet/i, size: '200K' },
  { pattern: /claude-haiku/i, size: '200K' },
  { pattern: /gpt-4-turbo/i, size: '128K' },
  { pattern: /gpt-4o/i, size: '128K' },
  { pattern: /o1/i, size: '128K' },
  { pattern: /o3/i, size: '200K' },
  { pattern: /gemini-1\.5/i, size: '1M' },
  { pattern: /gemini-2/i, size: '2M' },
  { pattern: /deepseek-v[2-9]/i, size: '128K' },
  { pattern: /deepseek-r[1-9]/i, size: '128K' },
  { pattern: /^kimi-k3$/i, size: '1M' },
  { pattern: /^kimi-k2\.(?:6|7)/i, size: '256K' },
  { pattern: /128k/i, size: '128K' },
  { pattern: /200k/i, size: '200K' },
  { pattern: /1m/i, size: '1M' },
]

export function getModelCapabilities(modelName: string): ModelCapabilities {
  if (!modelName) {
    return { reasoning: false, vision: false, largeContext: false }
  }

  const reasoning = REASONING_PATTERNS.some((pattern) => pattern.test(modelName))
  const vision = VISION_PATTERNS.some((pattern) => pattern.test(modelName))

  const contextMatch = LARGE_CONTEXT_MAP.find((entry) => entry.pattern.test(modelName))
  const largeContext = contextMatch !== undefined
  const contextSize = contextMatch?.size

  return {
    reasoning,
    vision,
    largeContext,
    contextSize,
  }
}
