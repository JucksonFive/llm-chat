import type { CorsOptions } from 'cors'

/**
 * Default origins allowed when ALLOWED_ORIGINS is not set:
 * - http://localhost:5173 — Vite dev server
 * - http://localhost:3001 — Express itself (Electron production default port)
 */
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3001']

/**
 * Parse the comma-separated ALLOWED_ORIGINS env var into a list of origins.
 * Falls back to the default localhost dev/prod origins.
 */
export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ALLOWED_ORIGINS
  if (!raw || !raw.trim()) {
    return [...DEFAULT_ALLOWED_ORIGINS]
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Loopback origins (localhost / 127.0.0.1 / [::1], http or https, any port) are
 * always allowed. In Electron production the embedded server may bind to an
 * OS-assigned port when 3001 is busy, and the window navigates to that
 * same-origin URL, so we cannot enumerate the port ahead of time. A remote
 * attacker page can never present a loopback origin, so this stays safe against
 * the cross-site request forgery threat this restriction defends against.
 */
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  // Requests with no Origin header (curl, server-to-server, same-origin
  // navigations) are always permitted.
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  if (LOOPBACK_ORIGIN.test(origin)) return true
  return false
}

/**
 * Build the cors() options object enforcing the allowlist. Handles OPTIONS
 * preflight automatically (the cors middleware short-circuits preflight) and
 * enables credentials.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allowedOrigins = getAllowedOrigins(env)
  return {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin ?? undefined, allowedOrigins)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
    },
    credentials: true,
  }
}
