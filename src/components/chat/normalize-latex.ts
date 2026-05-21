/** Detect LaTeX-like content: backslash commands, superscripts, subscripts, braces */
const LATEX_RE = /[\\^_{}]|\\[a-zA-Z]+/

/** Detect things that look like URLs, file paths, or markdown link refs — never math. */
const URL_LIKE_RE = /^(?:https?:\/\/|ftp:\/\/|mailto:|\/|\.\.?\/|[a-z]+:\/\/)/i

/**
 * Normalize various LaTeX notations into $...$ and $$...$$ so remark-math can parse them.
 *
 * remark-math requires:
 *   - display math: $$...$$ on its own lines, separated by blank lines
 *   - inline math: $...$
 *
 * Models produce: \[...\], \(...\), bare [ ... ] on own lines, bare (...) inline.
 *
 * Care is taken to avoid mangling markdown links like `[text](https://…/foo_bar)`,
 * bare URLs, and images, even though their parenthesised parts may contain
 * characters (`_`, `{`, `^`) that look LaTeX-y.
 */
export function normalizeLatex(text: string): string {
  // 1. \[...\] → display math (may be multiline)
  let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n\n$$\n${inner.trim()}\n$$\n\n`)

  // 2. \(...\) → inline math
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner.trim()}$`)

  // 3. Standalone [ ... ] on its own line with LaTeX content → display math.
  //    Skip markdown links/refs ([text](url) / [ref][id]) and images (![alt](url)).
  result = result
    .split('\n')
    .map((line) => {
      const match = /^([ \t]*)\[([\s\S]+?)\]([\s\S]*)$/.exec(line)
      if (!match) return line
      const [, , inner, rest] = match
      if (rest.startsWith('(') || rest.startsWith('[')) return line
      const trimmed = inner.trim()
      if (LATEX_RE.test(trimmed) && !URL_LIKE_RE.test(trimmed)) {
        return `\n\n$$\n${trimmed}\n$$\n\n`
      }
      return line
    })
    .join('\n')

  // 4. Inline (...) with LaTeX content → inline math.
  //    Skip parentheses that are part of a markdown link ](...) or look like a URL.
  result = result.replace(
    /(\]?)\(([^)]+)\)/g,
    (match, bracket: string, inner: string) => {
      if (bracket === ']') return match // markdown link target
      const trimmed = inner.trim()
      if (URL_LIKE_RE.test(trimmed)) return match
      if (LATEX_RE.test(trimmed)) return `${bracket}$${trimmed}$`
      return match
    },
  )

  // 5. Ensure $$ display blocks have blank lines around them (remark-math requirement)
  // Note: '$$' in replacement is special in JS regex, use a function to avoid issues
  result = result.replace(/([^\n])\n*\$\$/g, (_m, before) => `${before}\n\n$$`)
  result = result.replace(/\$\$\n*([^\n$])/g, (_m, after) => `$$\n\n${after}`)

  // 6. Collapse excessive blank lines
  result = result.replace(/\n{4,}/g, '\n\n\n')

  return result
}
