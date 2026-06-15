# H5 — Add CSP Headers to Express and Electron

**Severity:** High  
**CVSS:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)  
**Status:** Open  
**Files:** `server/index.ts`, `electron/main.ts`  

## Problem

No Content-Security-Policy headers are set. The app renders LLM-generated Markdown via `react-markdown`, which could theoretically contain malicious scripts. While `contextIsolation: true` in Electron prevents direct Node.js access, injected scripts could still exfiltrate conversation data through the renderer process.

## Acceptance criteria

- [ ] Express middleware sets CSP headers on all responses:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:*
  ```
- [ ] In Electron, set CSP via `session.defaultSession.webRequest.onHeadersReceived` for additional defense-in-depth
- [ ] CSP should be configurable via env var `CSP_HEADER` for users who need custom policies
- [ ] No regressions: the app loads and functions correctly with CSP enabled (check inline styles, API calls, image loading)
- [ ] Tests: verify CSP header present on HTML responses and API responses

## Implementation notes

- `'unsafe-inline'` for styles is needed because TailwindCSS and shadcn components use inline styles
- If KaTeX or highlight.js inject inline styles at runtime, they need the style-src exception
- Consider adding `require-trusted-types-for 'script'` for additional protection
- Test in both `pnpm dev` and Electron production mode
