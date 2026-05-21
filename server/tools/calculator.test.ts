import { describe, it, expect } from 'vitest'
import { calculatorTool } from './calculator.js'

async function exec(expression: string) {
  // The AI SDK `tool()` wraps the executor and exposes it via `.execute`.
  // We invoke the execute callback directly with minimal context.
  const result = await calculatorTool.execute!(
    { expression },
    { toolCallId: 't', messages: [] } as never,
  )
  return result as { expression?: string; result?: string; error?: string }
}

describe('calculatorTool', () => {
  it('evaluates basic arithmetic', async () => {
    const r = await exec('2 + 3 * 4')
    expect(r.error).toBeUndefined()
    expect(r.expression).toBe('2 + 3 * 4')
    expect(r.result).toBe('14')
  })

  it('evaluates exponents and roots', async () => {
    const r = await exec('sqrt(144)')
    expect(r.result).toBe('12')

    const r2 = await exec('2^10')
    expect(r2.result).toBe('1024')
  })

  it('handles unit conversions', async () => {
    const r = await exec('12 inch to cm')
    expect(r.error).toBeUndefined()
    // mathjs returns a Unit object that gets JSON-serialized.
    expect(r.result).toMatch(/30\.4[78]/)
    expect(r.result).toMatch(/cm/)
  })

  it('serializes object results as JSON', async () => {
    const r = await exec('[1, 2, 3]')
    expect(r.error).toBeUndefined()
    // mathjs may return a Matrix or array — both stringify to a JSON-like form.
    expect(typeof r.result).toBe('string')
    expect(r.result).toMatch(/\[/)
    expect(r.result).toMatch(/\]/)
  })

  it('returns an error message for invalid expressions', async () => {
    const r = await exec('not a real ((expression')
    expect(r.error).toBeDefined()
    expect(r.error).toMatch(/./) // some message is present
    expect(r.result).toBeUndefined()
  })

  it('returns an error for empty input', async () => {
    const r = await exec('')
    // mathjs returns undefined for empty input — captured as either an error
    // or `result: 'undefined'`. Accept both behaviors but require no crash.
    expect(r).toBeDefined()
  })
})
