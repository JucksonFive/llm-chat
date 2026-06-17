/**
 * Header that the server requires on all state-changing API requests
 * (POST/PUT/DELETE under /api/). This is a defense-in-depth CSRF mitigation:
 * a cross-site request from a malicious page cannot set this custom header
 * without triggering a CORS preflight, which the server does not satisfy for
 * untrusted origins.
 *
 * See server/index.ts requireClientHeader middleware.
 */
export const CLIENT_HEADER_NAME = 'X-LLM-Chat-Client'
export const CLIENT_HEADER_VALUE = '1'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * fetch() wrapper that automatically attaches the X-LLM-Chat-Client header on
 * state-changing requests. Use this for every call to the app's own /api/
 * endpoints so the server-side CSRF middleware accepts the request.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()

  if (!STATE_CHANGING_METHODS.has(method)) {
    return fetch(input, init)
  }

  const headers = new Headers(init.headers)
  if (!headers.has(CLIENT_HEADER_NAME)) {
    headers.set(CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE)
  }

  return fetch(input, { ...init, headers })
}
