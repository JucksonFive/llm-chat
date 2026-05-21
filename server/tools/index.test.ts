import { describe, expect, it } from 'vitest'
import { getBuiltInToolList, getBuiltInTools } from './index.js'

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
})
