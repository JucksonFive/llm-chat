# H1 — Sanitize `process.env` Before MCP Stdio Spawn

**Severity:** High  
**CVSS:** 6.8 (AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N)  
**Status:** Open  
**File:** `server/mcp-manager.ts`  

## Problem

The MCP manager passes the **entire** `process.env` to MCP server child processes:

```ts
// mcp-manager.ts:34
env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
```

This exposes sensitive environment variables to third-party MCP processes:
- `LLM_CHAT_MASTER_PASSWORD` — the DB encryption password
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`, `AWS_REGION`

## Acceptance criteria

- [ ] Replace `...process.env` with an explicit allowlist of safe variables:
  - `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`
  - `LANG`, `LC_ALL`, `LC_CTYPE`
  - `TMPDIR`, `TMP`, `TEMP`
  - Platform-specific: `DYLD_LIBRARY_PATH` (macOS), `LD_LIBRARY_PATH` (Linux)
  - `NODE_PATH`, `NODE_ENV`
- [ ] Explicit deny-list of known secret patterns: `*_API_KEY`, `*_SECRET*`, `*_PASSWORD*`, `AWS_*`, `LLM_CHAT_*`
- [ ] `config.env` still works — user-provided env vars override the safe defaults
- [ ] Document the allowlist in the MCP server configuration UI so users know which vars are propagated
- [ ] Tests: new unit test in `server/mcp-presets.test.ts` verifying that secret env vars are stripped

## Implementation notes

```ts
const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TMPDIR', 'TMP', 'TEMP',
  'NODE_PATH', 'NODE_ENV',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  // platform-specific
  'DYLD_LIBRARY_PATH', 'LD_LIBRARY_PATH',
]

const DENY_PATTERNS = [
  /_API_KEY$/i, /_SECRET/i, /_PASSWORD/i, /_TOKEN$/i,
  /^AWS_/, /^LLM_CHAT_/, /_CREDENTIALS$/i,
]

function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const key of SAFE_ENV_KEYS) {
    if (env[key] !== undefined) clean[key] = env[key]
  }
  // Also pass through any variable the user explicitly set in config.env
  // (handled by the spread order)
  return clean
}
```
