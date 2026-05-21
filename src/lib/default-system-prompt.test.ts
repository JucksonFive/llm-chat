import { describe, expect, it } from 'vitest'
import {
  CODING_AGENT_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  HUMANIZER_SYSTEM_PROMPT,
  LEGACY_DEFAULT_SYSTEM_PROMPT,
  MARKET_RESEARCHER_SYSTEM_PROMPT,
  SYSTEM_PROMPT_CREATOR_SYSTEM_PROMPT,
  SYSTEM_PROMPT_PRESETS,
} from './default-system-prompt'

describe('system prompt constants', () => {
  it('LEGACY_DEFAULT is the simple one-liner', () => {
    expect(LEGACY_DEFAULT_SYSTEM_PROMPT).toBe('You are a helpful assistant.')
  })

  it.each([
    ['DEFAULT', DEFAULT_SYSTEM_PROMPT],
    ['CODING', CODING_AGENT_SYSTEM_PROMPT],
    ['MARKET_RESEARCHER', MARKET_RESEARCHER_SYSTEM_PROMPT],
    ['SYSTEM_PROMPT_CREATOR', SYSTEM_PROMPT_CREATOR_SYSTEM_PROMPT],
    ['HUMANIZER', HUMANIZER_SYSTEM_PROMPT],
  ])('%s system prompt is non-trivial', (_label, prompt) => {
    expect(prompt.length).toBeGreaterThan(200)
    // Each detailed prompt should mention its language directive.
    expect(prompt.toLowerCase()).toMatch(/finnish|language/i)
  })
})

describe('SYSTEM_PROMPT_PRESETS', () => {
  it('has unique ids', () => {
    const ids = SYSTEM_PROMPT_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset has name, description, and prompt', () => {
    for (const preset of SYSTEM_PROMPT_PRESETS) {
      expect(preset.name).toBeTypeOf('string')
      expect(preset.description).toBeTypeOf('string')
      expect(preset.prompt).toBeTypeOf('string')
      expect(preset.prompt.length).toBeGreaterThan(50)
    }
  })

  it('professional preset uses the DEFAULT_SYSTEM_PROMPT', () => {
    const professional = SYSTEM_PROMPT_PRESETS.find((p) => p.id === 'professional')
    expect(professional?.prompt).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('coding preset uses the CODING_AGENT_SYSTEM_PROMPT', () => {
    const coding = SYSTEM_PROMPT_PRESETS.find((p) => p.id === 'coding')
    expect(coding?.prompt).toBe(CODING_AGENT_SYSTEM_PROMPT)
  })

  it('humanizer preset uses the HUMANIZER_SYSTEM_PROMPT', () => {
    const humanizer = SYSTEM_PROMPT_PRESETS.find((p) => p.id === 'humanizer')
    expect(humanizer?.prompt).toBe(HUMANIZER_SYSTEM_PROMPT)
  })
})
