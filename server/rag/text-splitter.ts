/**
 * Recursive character text splitter.
 *
 * Mirrors the semantics of LangChain's `RecursiveCharacterTextSplitter`:
 * try to split on the largest semantic boundary first (paragraphs), fall
 * back to smaller boundaries (lines, sentences, words) for any chunk that
 * is still over `chunkSize`. Chunks are then merged back up to the size
 * budget with `chunkOverlap` characters of context between them.
 *
 * We re-implement it here rather than pulling `@langchain/community` so the
 * dependency footprint stays small — the algorithm is ~50 lines.
 */

export interface SplitOptions {
  chunkSize?: number
  chunkOverlap?: number
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', '']

export function splitText(text: string, options: SplitOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1000
  const chunkOverlap = options.chunkOverlap ?? 150

  if (chunkOverlap >= chunkSize) {
    throw new Error(`chunkOverlap (${chunkOverlap}) must be smaller than chunkSize (${chunkSize})`)
  }
  if (!text) return []

  const fragments = recursiveSplit(text, DEFAULT_SEPARATORS, chunkSize)
  return mergeFragments(fragments, chunkSize, chunkOverlap)
}

function recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize) return [text]

  // Pick the first separator that actually appears in the text. Empty string
  // is the terminal case — split into single characters.
  const [head, ...rest] = separators
  const sep = head ?? ''
  const parts = sep === '' ? Array.from(text) : text.split(sep)

  const out: string[] = []
  for (const part of parts) {
    const reattached = sep === '' || out.length === 0 ? part : sep + part
    if (reattached.length <= chunkSize) {
      out.push(reattached)
    } else if (rest.length > 0) {
      out.push(...recursiveSplit(reattached, rest, chunkSize))
    } else {
      // No more separators — emit oversized fragment so merge can deal with it.
      out.push(reattached)
    }
  }
  return out.filter((f) => f.length > 0)
}

function mergeFragments(fragments: string[], chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = []
  let buffer: string[] = []
  let bufferLen = 0

  const flush = () => {
    if (buffer.length === 0) return
    chunks.push(buffer.join('').trim())
  }

  for (const fragment of fragments) {
    if (bufferLen + fragment.length > chunkSize && buffer.length > 0) {
      flush()

      // Carry overlap into the next buffer by keeping the trailing characters
      // of the just-emitted chunk. Walk fragments from the end to preserve
      // boundaries instead of slicing mid-token.
      const carry: string[] = []
      let carryLen = 0
      for (let i = buffer.length - 1; i >= 0 && carryLen < chunkOverlap; i--) {
        carry.unshift(buffer[i])
        carryLen += buffer[i].length
      }
      buffer = carry
      bufferLen = carryLen
    }
    buffer.push(fragment)
    bufferLen += fragment.length
  }
  flush()

  return chunks.filter((c) => c.length > 0)
}
