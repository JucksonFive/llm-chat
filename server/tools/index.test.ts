import { describe, expect, it } from 'vitest'
import { getBuiltInToolList, getBuiltInTools, getAvailableToolIds } from './index.js'

describe('getBuiltInToolList', () => {
  it('returns a non-empty list with id/name/description for each entry', () => {
    const list = getBuiltInToolList()
    expect(list.length).toBeGreaterThan(0)
    for (const meta of list) {
      expect(meta.id).toBeTypeOf('string')
      expect(meta.name).toBeTypeOf('string')
      expect(meta.description).toBeTypeOf('string')
      expect(meta.id.length).toBeGreaterThan(0)
    }
  })

  it('includes risk and policy metadata for each entry', () => {
    const list = getBuiltInToolList()
    for (const meta of list) {
      expect(typeof meta.enabledByDefault).toBe('boolean')
      expect(['safe', 'costly', 'destructive']).toContain(meta.riskLevel)
      expect(['auto', 'approvalRequired', 'disabled']).toContain(meta.executionPolicy)
    }
  })

  it('marks the expected tools as enabled by default', () => {
    const list = getBuiltInToolList()
    const defaultIds = list.filter((t) => t.enabledByDefault).map((t) => t.id).sort()
    expect(defaultIds).toEqual(['calculator', 'datetime', 'web-fetch', 'web-search'])
  })

  it('contains the core tool ids', () => {
    const ids = getBuiltInToolList().map((t) => t.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'web-fetch',
        'web-search',
        'code-executor',
        'file-reader',
        'file-writer',
        'calculator',
        'pdf-reader',
        'datetime',
        'image-generator',
        'deep-research',
        'index-document',
        'search-document',
      ]),
    )
  })

  it('has unique ids', () => {
    const ids = getBuiltInToolList().map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('exposes Kimi Official Tools only for the Kimi provider', () => {
    const kimiTools = getBuiltInToolList().filter((tool) => tool.providerIds?.includes('kimi'))
    expect(kimiTools.map((tool) => tool.id)).toEqual([
      'kimi-web-search',
      'kimi-rethink',
      'kimi-memory',
      'kimi-code-runner',
      'kimi-date',
      'kimi-convert',
      'kimi-random-choice',
      'kimi-excel',
      'kimi-quickjs',
      'kimi-fetch',
      'kimi-base64',
    ])
    expect(kimiTools.every((tool) => !tool.enabledByDefault)).toBe(true)
  })
})

describe('getBuiltInTools', () => {
  it('returns an empty record when no tools are enabled', () => {
    expect(getBuiltInTools([])).toEqual({})
  })

  it('converts hyphenated ids to snake_case keys', () => {
    const result = getBuiltInTools(['web-search', 'file-reader', 'datetime'])
    expect(Object.keys(result).sort()).toEqual(['datetime', 'file_reader', 'web_search'])
  })

  it('skips factory-based tools when no apiKey is given', () => {
    const result = getBuiltInTools(['image-generator'])
    expect(result).toEqual({})
  })

  it('includes factory-based tools when apiKey is provided', () => {
    const result = getBuiltInTools(['image-generator'], 'sk-test')
    expect(result).toHaveProperty('image_generator')
  })

  it('silently ignores unknown ids', () => {
    const result = getBuiltInTools(['totally-fake' as never, 'calculator'])
    expect(Object.keys(result)).toEqual(['calculator'])
  })

  it('mixes static and factory tools correctly', () => {
    const result = getBuiltInTools(['calculator', 'image-generator'], 'sk-test')
    expect(Object.keys(result).sort()).toEqual(['calculator', 'image_generator'])
  })

  it('leaves Kimi Official Tools to the Formula builder', () => {
    expect(getBuiltInTools(['kimi-date'], 'moonshot-key')).toEqual({})
  })
})

describe('getAvailableToolIds', () => {
  const emptySettings = { manuallyEnabledTools: [], manuallyDisabledTools: [] }
  const emptyContext = { hasUploadedPdf: false, hasIndexedDocument: false, workspaceAccessEnabled: false }

  it('returns default-enabled tools with empty settings and context', () => {
    const ids = getAvailableToolIds(emptySettings, emptyContext)
    expect(ids.sort()).toEqual(['calculator', 'datetime', 'web-fetch', 'web-search'])
  })

  it('includes manually enabled tools', () => {
    const ids = getAvailableToolIds(
      { manuallyEnabledTools: ['code-executor'], manuallyDisabledTools: [] },
      emptyContext,
    )
    expect(ids).toContain('code-executor')
    expect(ids).toContain('web-search')
  })

  it('excludes manually disabled tools even if default', () => {
    const ids = getAvailableToolIds(
      { manuallyEnabledTools: [], manuallyDisabledTools: ['web-search'] },
      emptyContext,
    )
    expect(ids).not.toContain('web-search')
    expect(ids).toContain('calculator')
  })

  it('conditionally enables pdf-reader when a PDF is uploaded', () => {
    const ids = getAvailableToolIds(emptySettings, { ...emptyContext, hasUploadedPdf: true })
    expect(ids).toContain('pdf-reader')
  })

  it('conditionally enables search-document when a document is indexed', () => {
    const ids = getAvailableToolIds(emptySettings, { ...emptyContext, hasIndexedDocument: true })
    expect(ids).toContain('search-document')
  })

  it('does not include conditional tools when context is not met', () => {
    const ids = getAvailableToolIds(emptySettings, emptyContext)
    expect(ids).not.toContain('pdf-reader')
    expect(ids).not.toContain('search-document')
  })

  it('manual disable takes precedence over manual enable', () => {
    const ids = getAvailableToolIds(
      { manuallyEnabledTools: ['code-executor'], manuallyDisabledTools: ['code-executor'] },
      emptyContext,
    )
    expect(ids).not.toContain('code-executor')
  })
})
