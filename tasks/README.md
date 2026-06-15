# Security Audit — Action Items

Generated from [SECURITY_AUDIT.md](../SECURITY_AUDIT.md) (2026-06-15, commit `7da0961`).

**14 tasks** across 4 severity levels. Each file below is a standalone, actionable task.

## Critical (fix before next release)

| # | ID | Task | File |
|---|-----|------|------|
| 1 | C1 | Sandbox shell execution in code-executor | [C1-code-executor-sandbox.md](C1-code-executor-sandbox.md) |
| 2 | C2 | Prevent SSRF in web-fetch and web-search | [C2-web-fetch-ssrf.md](C2-web-fetch-ssrf.md) |
| 3 | C3 | Restrict CORS to known origins | [C3-cors-restriction.md](C3-cors-restriction.md) |

## High (next 1–2 sprints)

| # | ID | Task | File |
|---|-----|------|------|
| 4 | H1 | Sanitize process.env before MCP stdio spawn | [H1-mcp-env-sanitize.md](H1-mcp-env-sanitize.md) |
| 5 | H2 | Strengthen default encryption or require master password | [H2-encryption-hardening.md](H2-encryption-hardening.md) |
| 6 | H3 | Encrypt API keys client-side before transmission | [H3-client-key-encryption.md](H3-client-key-encryption.md) |
| 7 | H4 | Add rate limiting to API endpoints | [H4-rate-limiting.md](H4-rate-limiting.md) |
| 8 | H5 | Add CSP headers to Express and Electron | [H5-csp-headers.md](H5-csp-headers.md) |

## Medium (within 1–3 months)

| # | ID | Task | File |
|---|-----|------|------|
| 9 | M1 | Add workspace restrictions to file tools | [M1-file-tool-workspace.md](M1-file-tool-workspace.md) |
| 10 | M2 | Fix silent decrypt fallback returning ciphertext | [M2-decrypt-fallback.md](M2-decrypt-fallback.md) |
| 11 | M3 | Add CSRF protection to state-changing endpoints | [M3-csrf-protection.md](M3-csrf-protection.md) |
| 12 | M4 | Add security audit logging | [M4-audit-logging.md](M4-audit-logging.md) |
| 13 | M5 | Add security warnings for MCP presets | [M5-mcp-preset-warnings.md](M5-mcp-preset-warnings.md) |

## Low (backlog)

| # | ID | Task | File |
|---|-----|------|------|
| 14 | L1 | Document HTTPS limitation for localhost | [L1-localhost-https.md](L1-localhost-https.md) |
