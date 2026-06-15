# L1 — Document HTTPS Limitation for Localhost

**Severity:** Low  
**CVSS:** 2.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N)  
**Status:** Open  
**Files:** `server/index.ts`, `vite.config.ts`, README  

## Problem

The Express server listens on plain HTTP (`http://localhost:3001`) with no TLS. API keys and conversation data are transmitted unencrypted over loopback. This is standard for localhost applications but worth documenting.

## Acceptance criteria

- [ ] Add a "Security" section to the README documenting that:
  - The app uses HTTP on localhost (not HTTPS)
  - API keys are transmitted over loopback during setup
  - For defense-in-depth, consider setting `LLM_CHAT_MASTER_PASSWORD`
- [ ] (Optional) Add a `HTTPS_ENABLED` env var that generates a self-signed cert and enables TLS:
  - Generate cert via `openssl` or the `selfsigned` npm package
  - Use `https.createServer` instead of `app.listen`
  - Not enabled by default — requires explicit user opt-in
- [ ] Tests: if HTTPS mode is implemented, verify secure cookies and HSTS headers

## Implementation notes

- This is primarily a documentation task
- The HTTPS mode is a "nice to have" — Electron's sandbox already isolates the app from other local processes
- If implementing HTTPS, store the self-signed cert in `~/.llm-chat/certs/`
