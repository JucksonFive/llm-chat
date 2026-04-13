import { tool, jsonSchema } from 'ai'

export const datetimeTool = tool({
  description: 'Get current date and time, convert between timezones, or calculate differences between dates. The LLM does not know the current time without this tool.',
  inputSchema: jsonSchema<{
    operation: 'now' | 'convert' | 'diff'
    timezone?: string
    date1?: string
    date2?: string
    targetTimezone?: string
  }>({
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['now', 'convert', 'diff'],
        description: 'Operation: "now" = current time, "convert" = convert timezone, "diff" = difference between two dates',
      },
      timezone: { type: 'string', description: 'IANA timezone (e.g. "Europe/Helsinki", "America/New_York"). Default: UTC' },
      date1: { type: 'string', description: 'First date (ISO 8601 string) for convert/diff operations' },
      date2: { type: 'string', description: 'Second date (ISO 8601 string) for diff operation' },
      targetTimezone: { type: 'string', description: 'Target timezone for convert operation' },
    },
    required: ['operation'],
  }),
  execute: async ({
    operation,
    timezone = 'UTC',
    date1,
    date2,
    targetTimezone,
  }) => {
    try {
      if (operation === 'now') {
        const now = new Date()
        return {
          iso: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          formatted: now.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }),
          timezone,
        }
      }

      if (operation === 'convert') {
        if (!date1) return { error: 'date1 is required for convert operation' }
        const d = new Date(date1)
        if (isNaN(d.getTime())) return { error: `Invalid date: ${date1}` }
        const target = targetTimezone || timezone
        return {
          original: date1,
          converted: d.toLocaleString('en-US', { timeZone: target, dateStyle: 'full', timeStyle: 'long' }),
          iso: d.toISOString(),
          timezone: target,
        }
      }

      if (operation === 'diff') {
        if (!date1 || !date2) return { error: 'Both date1 and date2 are required for diff operation' }
        const d1 = new Date(date1)
        const d2 = new Date(date2)
        if (isNaN(d1.getTime())) return { error: `Invalid date1: ${date1}` }
        if (isNaN(d2.getTime())) return { error: `Invalid date2: ${date2}` }

        const diffMs = d2.getTime() - d1.getTime()
        const absDiff = Math.abs(diffMs)
        const days = Math.floor(absDiff / 86400000)
        const hours = Math.floor((absDiff % 86400000) / 3600000)
        const minutes = Math.floor((absDiff % 3600000) / 60000)
        const seconds = Math.floor((absDiff % 60000) / 1000)

        return {
          date1: d1.toISOString(),
          date2: d2.toISOString(),
          differenceMs: diffMs,
          difference: { days, hours, minutes, seconds },
          humanReadable: `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`,
          direction: diffMs >= 0 ? 'date2 is after date1' : 'date2 is before date1',
        }
      }

      return { error: `Unknown operation: ${operation}` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'DateTime operation failed' }
    }
  },
})
