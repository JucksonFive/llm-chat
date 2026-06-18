import type { Request, Response, NextFunction } from 'express'

/**
 * Default Content-Security-Policy for production.
 *
 * - `default-src 'self'`        — only same-origin by default
 * - `script-src 'self'`         — no inline/remote scripts (mitigates injected
 *                                 scripts from LLM-generated Markdown)
 * - `style-src 'self' 'unsafe-inline'` — TailwindCSS / shadcn / KaTeX / highlight.js
 *                                 inject inline styles at runtime
 * - `img-src 'self' data: https:` — data URIs (generated images) + remote https images
 * - `connect-src 'self' http://localhost:*` — same-origin + local Express/Ollama/SearXNG
 */
export const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; connect-src 'self' http://localhost:*"

/**
 * Relaxed CSP for development.
 *
 * Vite's dev server (default origin http://localhost:5173) needs to be reachable
 * for HMR over WebSocket, and the dev client connects to the Express API on
 * localhost. We also allow `'unsafe-eval'`/`'unsafe-inline'` for scripts because
 * Vite injects an inline HMR client and uses eval-based module evaluation in dev.
 */
export const DEV_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' http://localhost:* ws://localhost:*"

/**
 * Resolve the CSP string to apply.
 *
 * Precedence:
 *   1. `CSP_HEADER` env var (explicit override — users with custom policies)
 *   2. Development relaxed policy when NODE_ENV !== 'production' and not running
 *      as an Electron production build
 *   3. Production strict policy
 */
export function resolveCspHeader(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CSP_HEADER && env.CSP_HEADER.trim()) {
    return env.CSP_HEADER.trim()
  }
  const isProd = env.NODE_ENV === 'production' || env.ELECTRON_PROD === 'true'
  return isProd ? PROD_CSP : DEV_CSP
}

/**
 * Express middleware that sets the Content-Security-Policy header on every
 * response. The header value is resolved once at construction time.
 */
export function cspMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const policy = resolveCspHeader(env)
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Content-Security-Policy', policy)
    next()
  }
}
