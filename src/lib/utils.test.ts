import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn (class merge helper)', () => {
  it('joins multiple class strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b')
  })

  it('flattens arrays of class names', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('expands object class maps', () => {
    expect(cn({ a: true, b: false, c: true })).toBe('a c')
  })

  it('lets later tailwind classes override earlier ones', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })

  it('lets a conditional override an unconditional class via twMerge', () => {
    expect(cn('text-sm', { 'text-lg': true })).toBe('text-lg')
  })

  it('returns empty string for no input', () => {
    expect(cn()).toBe('')
  })
})
