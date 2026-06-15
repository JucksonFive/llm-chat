# C3 — Restrict CORS to Known Origins

**Severity:** Critical  
**CVSS:** 6.5 (AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)  
**Status:** Open  
**File:** `server/index.ts`  

## Problem

```ts
// server/index.ts:19
app.use(cors())
```

This enables `Access-Control-Allow-Origin: *` for all routes. Any webpage the user visits in their browser (or the Electron window if XSS exists) can make requests to `http://localhost:3001` and:
- Read all agents, conversations, and messages
- Create/delete agents
- Access stored API keys (indirectly via `/api/chat`)
- Execute tools (code-executor, file-reader/writer)

## Acceptance criteria

- [ ] CORS restricted to an explicit allowlist:
  - `http://localhost:5173` (Vite dev server)
  - `http://localhost:3001` (Express itself, for Electron production mode)
  - The actual Electron origin (likely `file://` or the custom scheme)
- [ ] The origin list is configurable via env var `ALLOWED_ORIGINS` (comma-separated) for flexibility
- [ ] Preflight (`OPTIONS`) requests handled correctly
- [ ] No regressions: the app still works in dev mode (`pnpm dev`), Electron dev mode (`pnpm dev:electron`), and production Electron
- [ ] Test: verify CORS headers on a sample API response

## Implementation notes

```ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001')
  .split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
```

- In Electron production mode, the origin may be `file://` — add that explicitly if needed
- Consider adding a random port token in Electron to make origin prediction harder
