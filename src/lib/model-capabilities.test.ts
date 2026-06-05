import { describe, expect, it } from 'vitest'
import { getModelCapabilities } from './model-capabilities'

describe('getModelCapabilities', () => {
  describe('reasoning detection', () => {
    it('detects OpenAI o1 models', () => {
      expect(getModelCapabilities('o1').reasoning).toBe(true)
      expect(getModelCapabilities('o1-mini').reasoning).toBe(true)
      expect(getModelCapabilities('o1-preview').reasoning).toBe(true)
    })

    it('detects OpenAI o3 models', () => {
      expect(getModelCapabilities('o3').reasoning).toBe(true)
      expect(getModelCapabilities('o3-mini').reasoning).toBe(true)
      expect(getModelCapabilities('o3-pro').reasoning).toBe(true)
    })

    it('detects deepseek reasoning models', () => {
      expect(getModelCapabilities('deepseek-r1').reasoning).toBe(true)
      expect(getModelCapabilities('deepseek-reasoner').reasoning).toBe(true)
    })

    it('detects thinking models', () => {
      expect(getModelCapabilities('claude-3-5-sonnet-thinking').reasoning).toBe(true)
    })

    it('does not detect regular models as reasoning', () => {
      expect(getModelCapabilities('gpt-4o').reasoning).toBe(false)
      expect(getModelCapabilities('gpt-3.5-turbo').reasoning).toBe(false)
      expect(getModelCapabilities('claude-3-5-sonnet').reasoning).toBe(false)
    })
  })

  describe('vision detection', () => {
    it('detects GPT-4 vision models', () => {
      expect(getModelCapabilities('gpt-4-vision').vision).toBe(true)
      expect(getModelCapabilities('gpt-4o').vision).toBe(true)
      expect(getModelCapabilities('gpt-4-turbo').vision).toBe(true)
    })

    it('detects Claude 3+ models as vision-capable', () => {
      expect(getModelCapabilities('claude-3-opus').vision).toBe(true)
      expect(getModelCapabilities('claude-3-5-sonnet').vision).toBe(true)
      expect(getModelCapabilities('claude-haiku-4-5').vision).toBe(true)
    })

    it('detects Gemini models as vision-capable', () => {
      expect(getModelCapabilities('gemini-1.5-pro').vision).toBe(true)
      expect(getModelCapabilities('gemini-2.0-flash').vision).toBe(true)
    })

    it('detects Pixtral and LLaVA', () => {
      expect(getModelCapabilities('pixtral-12b').vision).toBe(true)
      expect(getModelCapabilities('llava-13b').vision).toBe(true)
    })
  })

  describe('large context detection', () => {
    it('detects Claude with 200K context', () => {
      const claude = getModelCapabilities('claude-3-5-sonnet')
      expect(claude.largeContext).toBe(true)
      expect(claude.contextSize).toBe('200K')
    })

    it('detects GPT-4 with 128K context', () => {
      const gpt4o = getModelCapabilities('gpt-4o')
      expect(gpt4o.largeContext).toBe(true)
      expect(gpt4o.contextSize).toBe('128K')
    })

    it('detects Gemini 1.5 with 1M context', () => {
      const gemini = getModelCapabilities('gemini-1.5-pro')
      expect(gemini.largeContext).toBe(true)
      expect(gemini.contextSize).toBe('1M')
    })

    it('detects Gemini 2 with 2M context', () => {
      const gemini2 = getModelCapabilities('gemini-2.0-flash')
      expect(gemini2.largeContext).toBe(true)
      expect(gemini2.contextSize).toBe('2M')
    })
  })

  describe('combined capabilities', () => {
    it('detects multiple capabilities for modern models', () => {
      const claude = getModelCapabilities('claude-3-5-sonnet')
      expect(claude.vision).toBe(true)
      expect(claude.largeContext).toBe(true)
      expect(claude.contextSize).toBe('200K')
    })

    it('detects all capabilities for thinking models with vision', () => {
      const claudeThinking = getModelCapabilities('claude-3-5-sonnet-thinking')
      expect(claudeThinking.reasoning).toBe(true)
      expect(claudeThinking.vision).toBe(true)
      expect(claudeThinking.largeContext).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns all false for empty model name', () => {
      const result = getModelCapabilities('')
      expect(result.reasoning).toBe(false)
      expect(result.vision).toBe(false)
      expect(result.largeContext).toBe(false)
    })

    it('returns all false for unknown model', () => {
      const result = getModelCapabilities('unknown-model-xyz')
      expect(result.reasoning).toBe(false)
      expect(result.vision).toBe(false)
      expect(result.largeContext).toBe(false)
    })

    it('handles case insensitivity', () => {
      expect(getModelCapabilities('GPT-4O').vision).toBe(true)
      expect(getModelCapabilities('Claude-3-Opus').vision).toBe(true)
      expect(getModelCapabilities('O1-MINI').reasoning).toBe(true)
    })
  })
})
