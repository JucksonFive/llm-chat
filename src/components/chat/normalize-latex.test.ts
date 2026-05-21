import { describe, expect, it } from 'vitest'
import { normalizeLatex } from './normalize-latex'

describe('normalizeLatex', () => {
  describe('\\[...\\] (display math)', () => {
    it('converts a single-line block', () => {
      const out = normalizeLatex('Result: \\[ x^2 + 1 \\]')
      expect(out).toContain('$$')
      expect(out).toContain('x^2 + 1')
      // Display blocks should be padded with blank lines.
      expect(out).toMatch(/\n\n\$\$/)
      expect(out).toMatch(/\$\$\n\n/)
    })

    it('converts multiline content', () => {
      const out = normalizeLatex('\\[\nf(x) = x^2\n\\]')
      expect(out).toContain('f(x) = x^2')
      // Block opens with $$, content body present, then a closing $$.
      expect(out).toMatch(/\$\$[\s\n]+f\(x\) = x\^2[\s\n]+\$\$/)
    })
  })

  describe('\\(...\\) (inline math)', () => {
    it('converts to single-dollar inline math', () => {
      expect(normalizeLatex('When \\( x = 0 \\), we have...')).toContain('$x = 0$')
    })

    it('does not pad with blank lines', () => {
      const out = normalizeLatex('When \\(x=0\\) we have...')
      expect(out).toBe('When $x=0$ we have...')
    })
  })

  describe('bare [ ... ] on own line', () => {
    it('promotes a single-line bracket-bound LaTeX block to display math', () => {
      const out = normalizeLatex('[ \\sum_{i=0}^n i ]')
      expect(out).toContain('$$')
      expect(out).toContain('\\sum_{i=0}^n i')
    })

    it('leaves prose-like brackets alone', () => {
      const out = normalizeLatex('[citation needed]')
      expect(out).toBe('[citation needed]')
    })

    it('leaves bracket lists alone', () => {
      const out = normalizeLatex('[1, 2, 3]')
      expect(out).toBe('[1, 2, 3]')
    })
  })

  describe('inline ( ... ) with LaTeX', () => {
    it('promotes parenthetical with LaTeX commands to inline math', () => {
      // \alpha contains a backslash → matches LATEX_RE
      const out = normalizeLatex('We use (\\alpha) here')
      expect(out).toBe('We use $\\alpha$ here')
    })

    it('promotes parenthetical with caret to inline math', () => {
      const out = normalizeLatex('Try (x^2) for that')
      expect(out).toBe('Try $x^2$ for that')
    })

    it('leaves prose parentheticals alone', () => {
      const out = normalizeLatex('I went home (after work)')
      expect(out).toBe('I went home (after work)')
    })

    it('leaves numeric parentheticals alone', () => {
      const out = normalizeLatex('See section (1.2.3) for details')
      expect(out).toBe('See section (1.2.3) for details')
    })
  })

  describe('blank-line padding around $$', () => {
    it('inserts a blank line before $$ when it follows text directly', () => {
      const input = 'Some text\n$$\nx^2\n$$'
      const out = normalizeLatex(input)
      expect(out).toMatch(/Some text\n\n\$\$/)
    })
  })

  describe('blank-line collapsing', () => {
    it('caps excessive blank lines at three newlines', () => {
      const out = normalizeLatex('a\n\n\n\n\n\nb')
      expect(out).not.toMatch(/\n{4,}/)
    })
  })

  describe('idempotency / no-ops', () => {
    it('passes plain text through unchanged', () => {
      expect(normalizeLatex('Just a sentence.')).toBe('Just a sentence.')
    })
  })
})
