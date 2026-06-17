import { describe, expect, it } from 'vitest'
import express from 'express'
import cors from 'cors'
import type { AddressInfo } from 'node:net'
import {
  buildCorsOptions,
  getAllowedOrigins,
  isOriginAllowed,
} from './cors-config.js'

describe('getAllowedOrigins', () => {
  it('returns the default localhost origins when env is unset', () => {
    expect(getAllowedOrigins({})).toEqual([
      'http://localhost:5173',
      'http://localhost:3001',
    ])
  })

  it('parses a comma-separated ALLOWED_ORIGINS env var', () => {
    expect(
      getAllowedOrigins({ ALLOWED_ORIGINS: 'https://a.com, https://b.com ' }),
    ).toEqual(['https://a.com', 'https://b.com'])
  })

  it('falls back to defaults for a blank env var', () => {
    expect(getAllowedOrigins({ ALLOWED_ORIGINS: '   ' })).toEqual([
      'http://localhost:5173',
      'http://localhost:3001',
    ])
  })
})

describe('isOriginAllowed', () => {
  const allowed = ['http://localhost:5173', 'https://app.example.com']

  it('allows requests with no origin (curl / server-to-server)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true)
  })

  it('allows an explicitly listed origin', () => {
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true)
  })

  it('allows any loopback origin/port (Electron OS-assigned port)', () => {
    expect(isOriginAllowed('http://localhost:54321', allowed)).toBe(true)
    expect(isOriginAllowed('http://127.0.0.1:3001', allowed)).toBe(true)
  })

  it('rejects an arbitrary external origin', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false)
    expect(isOriginAllowed('http://localhost.evil.com', allowed)).toBe(false)
  })
})

describe('CORS middleware (integration)', () => {
  function makeServer() {
    const app = express()
    app.use(cors(buildCorsOptions({ ALLOWED_ORIGINS: 'http://localhost:5173' })))
    app.get('/ping', (_req, res) => res.json({ ok: true }))
    const server = app.listen(0)
    const { port } = server.address() as AddressInfo
    return { server, base: `http://127.0.0.1:${port}` }
  }

  it('returns ACAO header for an allowed origin', async () => {
    const { server, base } = makeServer()
    try {
      const res = await fetch(`${base}/ping`, {
        headers: { Origin: 'http://localhost:5173' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      )
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    } finally {
      server.close()
    }
  })

  it('omits ACAO header for a disallowed origin', async () => {
    const { server, base } = makeServer()
    try {
      const res = await fetch(`${base}/ping`, {
        headers: { Origin: 'https://evil.example.com' },
      })
      // The cors middleware errors out, so no allow-origin header is set.
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      server.close()
    }
  })

  it('handles OPTIONS preflight for an allowed origin', async () => {
    const { server, base } = makeServer()
    try {
      const res = await fetch(`${base}/ping`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect(res.status).toBeLessThan(300)
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      )
    } finally {
      server.close()
    }
  })

  it('allows a no-origin request through', async () => {
    const { server, base } = makeServer()
    try {
      const res = await fetch(`${base}/ping`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    } finally {
      server.close()
    }
  })
})
