# M3 — Add CSRF Protection to State-Changing Endpoints

**Severity:** Medium  
**CVSS:** 4.3 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N)  
**Status:** Open  
**File:** `server/index.ts`, `server/db-routes.ts`  

## Problem

All POST/PUT/DELETE endpoints accept requests with no CSRF protection. Combined with the permissive CORS (C3), a malicious webpage could forge requests to create/delete agents, conversations, or modify MCP server configs.

Unlike traditional web apps, this is a local server — but the threat model includes:
- Malicious websites the user visits in their regular browser
- XSS in the Electron renderer

## Acceptance criteria

- [ ] Add a custom header requirement for state-changing requests:
  - Middleware checks for `X-LLM-Chat-Client: 1` header
  - All frontend `fetch` calls include this header
  - Reject requests missing the header with `403 Forbidden`
- [ ] OPTIONS preflight correctly exposes the custom header via `Access-Control-Allow-Headers`
- [ ] This is not strong CSRF protection (a determined attacker can set custom headers) but raises the bar significantly
- [ ] Tests: verify 403 returned when header is missing; verify normal requests work

## Implementation notes

```ts
// server/index.ts — add after cors()
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    if (req.headers['x-llm-chat-client'] !== '1') {
      res.status(403).json({ error: 'Missing required client header' })
      return
    }
  }
  next()
})
```

- This is a "defense in depth" measure — the primary fix is CORS restriction (C3)
