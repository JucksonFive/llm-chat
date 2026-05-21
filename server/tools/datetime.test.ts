import { describe, it, expect } from 'vitest'
import { datetimeTool } from './datetime.js'

type Result = {
  iso?: string
  unix?: number
  formatted?: string
  timezone?: string
  original?: string
  converted?: string
  date1?: string
  date2?: string
  differenceMs?: number
  difference?: { days: number; hours: number; minutes: number; seconds: number }
  humanReadable?: string
  direction?: string
  error?: string
}

async function exec(input: Parameters<typeof datetimeTool.execute>[0]) {
  return (await datetimeTool.execute!(input, {
    toolCallId: 't',
    messages: [],
  } as never)) as Result
}

describe('datetimeTool', () => {
  describe('now', () => {
    it('returns current time with ISO/unix/formatted/timezone', async () => {
      const before = Date.now()
      const r = await exec({ operation: 'now' })
      const after = Date.now()
      expect(r.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(r.unix).toBeTypeOf('number')
      // unix is floored to seconds; allow up to 1s slack on either side.
      expect(r.unix! * 1000).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000 - 1)
      expect(r.unix! * 1000).toBeLessThanOrEqual(after + 1)
      expect(r.timezone).toBe('UTC')
      expect(r.formatted).toMatch(/./)
    })

    it('respects an explicit timezone', async () => {
      const r = await exec({ operation: 'now', timezone: 'America/New_York' })
      expect(r.timezone).toBe('America/New_York')
      // Should mention EST/EDT/Eastern in the formatted string.
      expect(r.formatted).toMatch(/Eastern|EST|EDT/i)
    })
  })

  describe('convert', () => {
    it('returns error when date1 is missing', async () => {
      const r = await exec({ operation: 'convert' })
      expect(r.error).toMatch(/date1 is required/i)
    })

    it('returns error for an unparseable date', async () => {
      const r = await exec({ operation: 'convert', date1: 'not-a-date' })
      expect(r.error).toMatch(/Invalid date/)
    })

    it('converts a valid ISO date into the target timezone', async () => {
      const r = await exec({
        operation: 'convert',
        date1: '2024-06-15T12:00:00Z',
        targetTimezone: 'Europe/Helsinki',
      })
      expect(r.error).toBeUndefined()
      expect(r.iso).toBe('2024-06-15T12:00:00.000Z')
      expect(r.timezone).toBe('Europe/Helsinki')
      // June in Helsinki is UTC+3, so the local hour should be 15.
      expect(r.converted).toMatch(/3:00|15:00/)
    })

    it('falls back to "timezone" when targetTimezone is omitted', async () => {
      const r = await exec({
        operation: 'convert',
        date1: '2024-01-01T00:00:00Z',
        timezone: 'Europe/Helsinki',
      })
      expect(r.timezone).toBe('Europe/Helsinki')
    })
  })

  describe('diff', () => {
    it('returns error when either date is missing', async () => {
      expect((await exec({ operation: 'diff', date1: '2024-01-01' })).error).toMatch(/Both/)
      expect((await exec({ operation: 'diff', date2: '2024-01-01' })).error).toMatch(/Both/)
    })

    it('flags an invalid date1', async () => {
      const r = await exec({ operation: 'diff', date1: 'bad', date2: '2024-01-01' })
      expect(r.error).toMatch(/Invalid date1/)
    })

    it('flags an invalid date2', async () => {
      const r = await exec({ operation: 'diff', date1: '2024-01-01', date2: 'bad' })
      expect(r.error).toMatch(/Invalid date2/)
    })

    it('computes positive diff when date2 is later', async () => {
      const r = await exec({
        operation: 'diff',
        date1: '2024-01-01T00:00:00Z',
        date2: '2024-01-02T01:30:45Z',
      })
      expect(r.error).toBeUndefined()
      expect(r.differenceMs).toBe(86400000 + 1 * 3600000 + 30 * 60000 + 45000)
      expect(r.difference).toEqual({ days: 1, hours: 1, minutes: 30, seconds: 45 })
      expect(r.direction).toBe('date2 is after date1')
      expect(r.humanReadable).toMatch(/1 days, 1 hours, 30 minutes, 45 seconds/)
    })

    it('computes negative diff (date2 before date1) but reports absolute breakdown', async () => {
      const r = await exec({
        operation: 'diff',
        date1: '2024-01-02T00:00:00Z',
        date2: '2024-01-01T00:00:00Z',
      })
      expect(r.differenceMs).toBe(-86400000)
      expect(r.difference).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 })
      expect(r.direction).toBe('date2 is before date1')
    })
  })

  it('returns an error for unknown operations', async () => {
    const r = await exec({ operation: 'bogus' as never })
    expect(r.error).toMatch(/Unknown operation/)
  })
})
