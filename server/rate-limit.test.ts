import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { createLimiter } from './rate-limit.js'

let server: Server | undefined

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  }
})

async function startApp(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

describe('createLimiter', () => {
  it('returns 429 with a human-readable message after the limit is exceeded', async () => {
    const app = express()
    // Tiny limit for a fast, deterministic test.
    app.use('/api/test', createLimiter(2, 'test'))
    app.get('/api/test', (_req, res) => res.json({ ok: true }))

    const base = await startApp(app)

    const r1 = await fetch(`${base}/api/test`)
    const r2 = await fetch(`${base}/api/test`)
    const r3 = await fetch(`${base}/api/test`)

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r3.status).toBe(429)

    const body = (await r3.json()) as { error: string }
    expect(body.error).toMatch(/too many test requests/i)
  })

  it('sets standard and legacy rate-limit headers', async () => {
    const app = express()
    app.use('/api/test', createLimiter(5, 'test'))
    app.get('/api/test', (_req, res) => res.json({ ok: true }))

    const base = await startApp(app)
    const res = await fetch(`${base}/api/test`)

    // Legacy headers requested by the acceptance criteria.
    expect(res.headers.get('x-ratelimit-limit')).toBe('5')
    expect(res.headers.get('x-ratelimit-remaining')).toBe('4')
    expect(res.headers.get('x-ratelimit-reset')).not.toBeNull()
    // Standard draft RateLimit headers.
    expect(res.headers.get('ratelimit-limit')).toBe('5')
    expect(res.headers.get('ratelimit-remaining')).toBe('4')
  })
})
