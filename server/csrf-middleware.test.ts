import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireClientHeader } from './csrf.js'

function mockReq(method: string, path: string, headers: Record<string, string> = {}): Request {
  return { method, path, headers } as unknown as Request
}

function mockRes(): Response & { _status?: number; _json?: unknown } {
  const res = {} as Response & { _status?: number; _json?: unknown }
  res.status = vi.fn((code: number) => {
    res._status = code
    return res
  }) as unknown as Response['status']
  res.json = vi.fn((body: unknown) => {
    res._json = body
    return res
  }) as unknown as Response['json']
  return res
}

describe('requireClientHeader (CSRF defense-in-depth)', () => {
  it('rejects a state-changing /api request missing the client header', () => {
    const req = mockReq('POST', '/api/db/agents')
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    requireClientHeader(req, res, next)

    expect(res._status).toBe(403)
    expect(res._json).toEqual({ error: 'Missing required client header' })
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a state-changing /api request with the correct client header', () => {
    const req = mockReq('POST', '/api/db/agents', { 'x-llm-chat-client': '1' })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    requireClientHeader(req, res, next)

    expect(res._status).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('allows GET requests without the header', () => {
    const req = mockReq('GET', '/api/db/agents')
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    requireClientHeader(req, res, next)

    expect(res._status).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('ignores non-/api state-changing requests', () => {
    const req = mockReq('POST', '/health')
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    requireClientHeader(req, res, next)

    expect(res._status).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects PUT and DELETE without the header', () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const req = mockReq(method, '/api/db/agents/123')
      const res = mockRes()
      const next = vi.fn() as unknown as NextFunction

      requireClientHeader(req, res, next)

      expect(res._status).toBe(403)
      expect(next).not.toHaveBeenCalled()
    }
  })
})
