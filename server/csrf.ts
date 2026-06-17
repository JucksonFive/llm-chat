import type { Request, Response, NextFunction } from 'express'

/**
 * CSRF defense-in-depth: state-changing requests to /api/ must carry a custom
 * header that cross-site requests cannot set without a CORS preflight (which
 * the server does not satisfy for untrusted origins). See src/lib/api-fetch.ts
 * for the client side that attaches it.
 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const CLIENT_HEADER_NAME = 'x-llm-chat-client'
export const CLIENT_HEADER_VALUE = '1'

export function requireClientHeader(req: Request, res: Response, next: NextFunction): void {
  if (STATE_CHANGING_METHODS.has(req.method) && req.path.startsWith('/api/')) {
    if (req.headers[CLIENT_HEADER_NAME] !== CLIENT_HEADER_VALUE) {
      res.status(403).json({ error: 'Missing required client header' })
      return
    }
  }
  next()
}
