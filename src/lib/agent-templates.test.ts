import { describe, expect, it } from 'vitest'
import {
  AGENT_TEMPLATES,
  DEFAULT_AGENT_TEMPLATE,
  HUMANIZER_TEMPLATE,
  MARKET_RESEARCHER_TEMPLATE,
  PROGRAMMER_AGENT_TEMPLATE,
  SYSTEM_PROMPT_CREATOR_TEMPLATE,
} from './agent-templates'
import { PROVIDERS } from './providers'

describe('AGENT_TEMPLATES', () => {
  it('exports a non-empty array', () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('every template has unique id', () => {
    const ids = AGENT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every template references a known provider id', () => {
    for (const tpl of AGENT_TEMPLATES) {
      expect(PROVIDERS[tpl.providerId]).toBeDefined()
    }
  })

  it("every template's model is in its provider's model list", () => {
    for (const tpl of AGENT_TEMPLATES) {
      expect(PROVIDERS[tpl.providerId].models).toContain(tpl.model)
    }
  })

  it('every template has a non-empty system prompt', () => {
    for (const tpl of AGENT_TEMPLATES) {
      expect(tpl.systemPrompt.length).toBeGreaterThan(50)
    }
  })

  it('builtInToolIds is always an array (possibly empty)', () => {
    for (const tpl of AGENT_TEMPLATES) {
      expect(Array.isArray(tpl.builtInToolIds)).toBe(true)
    }
  })

  it('exports the expected named template constants', () => {
    expect(DEFAULT_AGENT_TEMPLATE).toBe(AGENT_TEMPLATES[0])
    expect(PROGRAMMER_AGENT_TEMPLATE.id).toBe('programmer-docs')
    expect(MARKET_RESEARCHER_TEMPLATE.id).toBe('market-researcher')
    expect(SYSTEM_PROMPT_CREATOR_TEMPLATE.id).toBe('system-prompt-creator')
    expect(HUMANIZER_TEMPLATE.id).toBe('humanizer')
  })
})
