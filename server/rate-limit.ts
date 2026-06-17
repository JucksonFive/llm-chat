import rateLimit, { type Options } from 'express-rate-limit'

const ONE_MINUTE = 60_000

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/**
 * Per-minute request limits. The chat and general (db GET) limits are
 * configurable via the RATE_LIMIT_CHAT and RATE_LIMIT_GENERAL env vars.
 */
export const RATE_LIMITS = {
  chat: parseLimit(process.env.RATE_LIMIT_CHAT, 15),
  general: parseLimit(process.env.RATE_LIMIT_GENERAL, 100),
  mcpTest: 5,
  extractMemories: 10,
  dbWrite: 30,
} as const

/**
 * Build an express-rate-limit middleware with consistent defaults:
 * - per-minute window
 * - both standard `RateLimit-*` and legacy `X-RateLimit-*` headers
 * - a 429 JSON response with a human-readable message
 */
export function createLimiter(max: number, label: string, windowMs = ONE_MINUTE): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: true,
    message: { error: `Too many ${label} requests. Please slow down and try again shortly.` },
    handler: (_req, res, _next, opts) => {
      res.status(opts.statusCode).json({
        error: `Too many ${label} requests. Please slow down and try again shortly.`,
      })
    },
  }
  return rateLimit(options)
}

export const chatLimiter = createLimiter(RATE_LIMITS.chat, 'chat')
export const mcpTestLimiter = createLimiter(RATE_LIMITS.mcpTest, 'MCP test')
export const extractMemoriesLimiter = createLimiter(RATE_LIMITS.extractMemories, 'memory extraction')

const dbWriteLimiter = createLimiter(RATE_LIMITS.dbWrite, 'database write')
const dbReadLimiter = createLimiter(RATE_LIMITS.general, 'database read')

/**
 * Method-aware limiter for `/api/db/*`: writes (POST/PUT/PATCH/DELETE) use the
 * stricter write limit, reads (GET/HEAD) use the general limit.
 */
export const dbLimiter: ReturnType<typeof rateLimit> = ((req, res, next) => {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return dbReadLimiter(req, res, next)
  }
  return dbWriteLimiter(req, res, next)
}) as ReturnType<typeof rateLimit>
