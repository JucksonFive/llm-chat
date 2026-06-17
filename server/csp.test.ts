import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { cspMiddleware, resolveCspHeader, PROD_CSP, DEV_CSP } from './csp.js'

function mockRes() {
  const headers: Record<string, string> = {}
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
  } as unknown as Response
  return { res, headers }
}

describe('resolveCspHeader', () => {
  it('returns the production policy when NODE_ENV=production', () => {
    expect(resolveCspHeader({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(PROD_CSP)
  })

  it('returns the production policy under Electron production', () => {
    expect(resolveCspHeader({ ELECTRON_PROD: 'true' } as NodeJS.ProcessEnv)).toBe(PROD_CSP)
  })

  it('returns the relaxed dev policy otherwise', () => {
    expect(resolveCspHeader({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(DEV_CSP)
  })

  it('honours the CSP_HEADER override', () => {
    const custom = "default-src 'none'"
    expect(resolveCspHeader({ CSP_HEADER: custom, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(custom)
  })

  it('ignores a blank CSP_HEADER override', () => {
    expect(resolveCspHeader({ CSP_HEADER: '   ', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(PROD_CSP)
  })

  it('production policy matches the documented acceptance criteria', () => {
    expect(PROD_CSP).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; connect-src 'self' http://localhost:*",
    )
  })
})

describe('cspMiddleware', () => {
  it('sets the Content-Security-Policy header and calls next', () => {
    const mw = cspMiddleware({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    const { res, headers } = mockRes()
    const next = vi.fn() as unknown as NextFunction
    mw({} as Request, res, next)
    expect(headers['Content-Security-Policy']).toBe(PROD_CSP)
    expect(next).toHaveBeenCalledOnce()
  })

  it('applies a CSP_HEADER override through the middleware', () => {
    const custom = "default-src 'self'; script-src 'self' https://cdn.example.com"
    const mw = cspMiddleware({ CSP_HEADER: custom } as NodeJS.ProcessEnv)
    const { res, headers } = mockRes()
    const next = vi.fn() as unknown as NextFunction
    mw({} as Request, res, next)
    expect(headers['Content-Security-Policy']).toBe(custom)
  })
})
