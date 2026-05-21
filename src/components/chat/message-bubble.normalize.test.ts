import { describe, it, expect } from 'vitest'
import { normalizeLatex } from './normalize-latex'

// These tests cover both behaviors that already existed on `main` (math
// conversions) and the bugfix (markdown links and URLs containing `_`,
// `^`, `{`, `}` must not be reinterpreted as math).

describe('normalizeLatex — existing math conversions (main-branch regression)', () => {
  it(String.raw`converts \[ ... \] to display math`, () => {
    const out = normalizeLatex(String.raw`See: \[ E = mc^2 \]`)
    expect(out).toMatch(/\$\$\s*E = mc\^2\s*\$\$/)
  })

  it(String.raw`converts \( ... \) to inline math`, () => {
    expect(normalizeLatex(String.raw`Speed \( v = d/t \).`)).toBe('Speed $v = d/t$.')
  })

  it('converts standalone [ ... ] line with LaTeX to display math', () => {
    const out = normalizeLatex('Equation:\n[ x^2 + y^2 = z^2 ]\nThat is it.')
    expect(out).toMatch(/\$\$\s*x\^2 \+ y\^2 = z\^2\s*\$\$/)
  })

  it('converts inline ( ... ) with LaTeX content to inline math', () => {
    expect(normalizeLatex('compute (x_1 + x_2) please')).toContain('$x_1 + x_2$')
  })

  it('leaves plain prose ( ... ) without LaTeX content untouched', () => {
    const text = 'This is a sentence (with a parenthetical).'
    expect(normalizeLatex(text)).toBe(text)
  })

  it('ensures blank lines around $$ blocks', () => {
    const out = normalizeLatex(String.raw`Text\[a=b\]more text`)
    // The math block must be separated from surrounding prose by blank lines.
    expect(out).toMatch(/Text\n\n\$\$/)
    expect(out).toMatch(/\$\$\n\nmore text/)
  })
})

describe('normalizeLatex — markdown link / URL preservation (bugfix)', () => {
  it('does not turn a markdown link target into math when the URL contains an underscore', () => {
    const input = 'See [Wikipedia](https://fi.wikipedia.org/wiki/Full_stack) for details.'
    const out = normalizeLatex(input)
    expect(out).toBe(input)
    expect(out).not.toContain('$')
  })

  it('does not turn a markdown link target into math when the URL contains braces or carets', () => {
    const input = '[Docs](https://example.com/api/v1/{id}/items)'
    expect(normalizeLatex(input)).toBe(input)
  })

  it('does not transform a standalone bare URL even if it contains underscores', () => {
    const input = 'Visit https://example.com/foo_bar for the docs.'
    expect(normalizeLatex(input)).toBe(input)
  })

  it('does not transform a bare URL wrapped in parentheses', () => {
    const input = 'See the docs (https://example.com/foo_bar) for details.'
    expect(normalizeLatex(input)).toBe(input)
  })

  it('does not transform a markdown image', () => {
    const input = '![alt](https://example.com/foo_bar.png)'
    expect(normalizeLatex(input)).toBe(input)
  })

  it('does not transform a markdown reference-style link', () => {
    const input = 'See [Wiki][wiki_ref] for more.'
    expect(normalizeLatex(input)).toBe(input)
  })

  it('does not treat file-like or relative paths as math', () => {
    expect(normalizeLatex('open (/etc/hosts) please')).toBe('open (/etc/hosts) please')
    expect(normalizeLatex('see (./src/foo_bar.ts)')).toBe('see (./src/foo_bar.ts)')
  })

  it('still treats math next to a link correctly', () => {
    const input = String.raw`See [Wikipedia](https://wiki/Full_stack); the formula is \( a^2 + b^2 \).`
    const out = normalizeLatex(input)
    expect(out).toContain('[Wikipedia](https://wiki/Full_stack)')
    expect(out).toContain('$a^2 + b^2$')
  })
})
