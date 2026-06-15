# H4 — Add Rate Limiting to API Endpoints

**Severity:** High  
**CVSS:** 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L)  
**Status:** Open  
**File:** `server/index.ts`  

## Problem

No rate limiting is applied to any API endpoint. An attacker (or buggy client) can:
- Flood `/api/chat` → exhaust LLM API credits (financial DoS)
- Rapidly create/delete agents/conversations → DB churn, potential corruption
- Spam `/api/mcp/test` → excessive MCP server connections
- Flood `/api/extract-memories` → LLM API costs

The only existing protection is a 120s server-side timeout per chat request (`server/index.ts:369-372`).

## Acceptance criteria

- [ ] Install `express-rate-limit` (or implement a lightweight in-memory rate limiter)
- [ ] Apply limits per endpoint group:
  - `/api/chat` — 15 req/min per origin
  - `/api/mcp/test` — 5 req/min
  - `/api/extract-memories` — 10 req/min
  - `/api/db/*` POST/PUT/DELETE — 30 req/min
  - `/api/db/*` GET — 100 req/min
- [ ] Rate limit headers in responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Return `429 Too Many Requests` with a human-readable message when exceeded
- [ ] Configurable via env vars: `RATE_LIMIT_CHAT`, `RATE_LIMIT_GENERAL`
- [ ] Tests: verify 429 returned after exceeding limits

## Implementation notes

- Use `express-rate-limit` with `windowMs` and `max`
- For Electron (single-user desktop app), IP-based limiting is effectively per-app
- Consider using the `X-Forwarded-For` header if a reverse proxy is ever used
