import { describe, expect, it } from 'vitest'
import { AVATAR_COLORS, PROVIDERS, PROVIDER_LIST } from './providers'

describe('PROVIDERS', () => {
  it('has the expected provider ids', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([
      'anthropic',
      'bedrock',
      'deepseek',
      'google',
      'ollama',
      'openai',
    ])
  })

  it('every provider matches its entry id', () => {
    for (const [id, meta] of Object.entries(PROVIDERS)) {
      expect(meta.id).toBe(id)
    }
  })

  it('every provider declares at least one model', () => {
    for (const meta of Object.values(PROVIDERS)) {
      expect(meta.models.length).toBeGreaterThan(0)
      for (const model of meta.models) {
        expect(model).toBeTypeOf('string')
        expect(model.length).toBeGreaterThan(0)
      }
    }
  })

  it('marks ollama and bedrock as not requiring an API key', () => {
    expect(PROVIDERS.ollama.requiresApiKey).toBe(false)
    expect(PROVIDERS.bedrock.requiresApiKey).toBe(false)
    for (const id of ['openai', 'anthropic', 'google', 'deepseek'] as const) {
      expect(PROVIDERS[id].requiresApiKey).toBe(true)
    }
  })

  it('marks ollama as supporting free-text models', () => {
    expect(PROVIDERS.ollama.freeTextModel).toBe(true)
    expect(PROVIDERS.openai.freeTextModel).toBeUndefined()
  })

  it('PROVIDER_LIST contains every provider', () => {
    expect(PROVIDER_LIST).toHaveLength(Object.keys(PROVIDERS).length)
    expect(PROVIDER_LIST.map((p) => p.id).sort()).toEqual(Object.keys(PROVIDERS).sort())
  })
})

describe('AVATAR_COLORS', () => {
  it('contains 8 hex colors', () => {
    expect(AVATAR_COLORS).toHaveLength(8)
    for (const color of AVATAR_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('all colors are unique', () => {
    expect(new Set(AVATAR_COLORS).size).toBe(AVATAR_COLORS.length)
  })
})
