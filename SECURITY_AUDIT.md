# Security Audit Report — LLM Chat

**Date:** 2026-06-15  
**Branch:** `create-security-audit`  
**Commit:** `7da0961`  
**Auditor:** Claude Code Security Analysis  

---

## Executive Summary

This report covers a comprehensive security review of the LLM Chat desktop application. The application is an Electron-based multi-provider LLM chat client with a local Express backend, SQLite storage, MCP (Model Context Protocol) integration, and 12 built-in tools including code execution and file system access.

**14 findings** were identified: 3 Critical, 5 High, 5 Medium, 1 Low.

The most pressing concerns are:
1. Arbitrary shell command execution via the code-executor tool
2. Missing localhost SSRF protection in web-fetch
3. Overly permissive CORS configuration
4. Process environment leaked to MCP child processes
5. Predictable machine-keyed encryption when master password is not set

---

## Scope

- **Reviewed files:** All server-side code (`server/`), Electron configuration (`electron/`), client stores (`src/stores/`), tool implementations (`server/tools/`), and configuration files.
- **Excluded:** `node_modules/`, `dist/`, `release/`, third-party dependencies (assumed trusted at their published versions).

---

## Findings

### CRITICAL

#### [C1] Arbitrary Shell Command Execution via Code Executor Tool

**File:** `server/tools/code-executor.ts:82-94`  
**Severity:** Critical  
**CVSS:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H)

The code-executor tool accepts arbitrary `shell` language code and executes it via `bash -c`:

```ts
function executeProcess(language: 'python' | 'shell', code: string, timeout: number) {
  const cmd = language === 'python' ? 'python3' : 'bash'
  const args = ['-c', code]
  execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, ...)
}
```

While the tool is classified as `destructive` with `approvalRequired` execution policy, the LLM can still be manipulated or prompt-injected into generating malicious shell commands. The approval is a UI prompt — if the user approves without careful inspection, arbitrary commands run with the user's privileges.

**Recommendations:**
- Add a sandbox/containerization layer (e.g., Docker-based execution or `bubblewrap`)
- Enforce a command allowlist (e.g., only allow `ls`, `cat`, `grep`, `find`, etc.)
- Log all executed commands and their results to an audit file
- Consider running shell commands inside a restricted environment (e.g., `firejail` on Linux, `sandbox-exec` on macOS)
- Add a prominent warning about the risks in the UI approval dialog, showing the exact command that will be executed

---

#### [C2] Server-Side Request Forgery (SSRF) via Web-Fetch

**File:** `server/tools/web-fetch.ts:18-28`  
**Severity:** Critical  
**CVSS:** 7.7 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N)

The web-fetch tool performs an unvalidated `fetch(url)` call to any URL provided by the LLM:

```ts
const response = await fetch(url, { signal: controller.signal, ... })
```

An attacker (or a prompt-injected model) could instruct the tool to fetch:
- Internal services: `http://localhost:8888/searxng/admin`, `http://localhost:3001/api/db/agents`
- Cloud metadata endpoints: `http://169.254.169.254/latest/meta-data/` (AWS), `http://metadata.google.internal/` (GCP)
- File URLs: `file:///etc/passwd`
- Internal network hosts

The web-search tool has a similar issue via `fetchPageContent()` at `server/tools/web-search.ts:70-101`.

**Recommendations:**
- Block private/reserved IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16)
- Block `localhost` and `*.local` hostnames
- Block `file://`, `ftp://`, and other non-HTTP(S) protocols
- Add a configurable domain allowlist (e.g., all domains allowed by default, with option to restrict)
- Set a maximum redirect chain length (currently no redirect limit set via `redirect: 'follow'` which is `fetch`'s default)

---

#### [C3] Overly Permissive CORS Configuration

**File:** `server/index.ts:19`  
**Severity:** Critical  
**CVSS:** 6.5 (AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)

```ts
app.use(cors())
```

This enables CORS with **no restrictions** — any origin can make requests to the local Express server. While this is a desktop app, any website visited in the user's regular browser (or the Electron window if XSS is possible) can:
- Read all agents, conversations, and messages from `/api/db/*`
- Create/delete agents and conversations
- Access stored API keys (via the `/api/chat` endpoint which resolves and uses them)
- Execute tools including code-executor and file-reader/writer

In Electron, the app loads from `http://localhost:<port>`, meaning any `localhost`-origin page can access the API.

**Recommendations:**
- Restrict CORS to `http://localhost:5173` (dev) and the actual Electron origin
- Add explicit origin validation: `cors({ origin: ['http://localhost:5173', 'http://localhost:3001', 'file://'] })`
- Consider adding a random token/secret in the Electron URL to prevent other localhost pages from accessing the API

---

### HIGH

#### [H1] Process Environment Leaked to MCP Child Processes

**File:** `server/mcp-manager.ts:31-35`  
**Severity:** High  
**CVSS:** 6.8 (AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N)

```ts
transport = new StdioClientTransport({
  command: config.command,
  args: config.args ?? [],
  env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
})
```

The entire `process.env` is propagated to MCP server child processes. This includes:
- `LLM_CHAT_MASTER_PASSWORD` (the DB encryption password)
- Any API keys set via environment variables (e.g., `OPENAI_API_KEY`)
- AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`)
- Any other secrets in the user's environment

MCP servers are third-party processes and should not receive the host's full environment.

**Recommendations:**
- Create an allowlist of safe environment variables to propagate (e.g., `PATH`, `HOME`, `USER`, platform vars)
- Explicitly block known secret env vars: `LLM_CHAT_MASTER_PASSWORD`, `AWS_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`
- Add `config.env` merging only for explicitly provided variables
- Document this behavior prominently in the MCP server configuration UI

---

#### [H2] Predictable Machine-Keyed Encryption (Default Mode)

**File:** `server/crypto.ts:7-10`  
**Severity:** High  
**CVSS:** 5.9 (AV:L/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:H)

```ts
const KEY = crypto.scryptSync(
  `${os.hostname()}-${os.homedir()}-${SALT}`,
  SALT,
  32,
)
```

When `LLM_CHAT_MASTER_PASSWORD` is **not set**, the API key encryption key is derived from:
- `os.hostname()` — often predictable (e.g., "MacBook-Pro", "DESKTOP-XXX")
- `os.homedir()` — typically `/Users/<username>` or `/home/<username>`
- `SALT` — a hardcoded constant (`'llm-chat-v1'`)

An attacker with local file access who knows (or can guess) these values can decrypt the database and recover stored API keys. The comment in the code (`"Not bulletproof, but much better than plaintext"`) acknowledges the weakness.

**Recommendations:**
- **Strongly encourage** the use of `LLM_CHAT_MASTER_PASSWORD` via documentation and in-app prompts on first launch
- Use OS keychain (Keychain Access on macOS, `libsecret` on Linux, Credential Manager on Windows) instead of machine-keyed derivation as the fallback
- At minimum, add `os.userInfo().username` and a machine ID to the key material to increase entropy
- Consider requiring a master password on first launch (mandatory, not optional)

---

#### [H3] API Keys Transmitted in Plaintext Over HTTP

**Files:** `src/stores/api-key-store.ts:55-66`, `server/db-routes.ts:54-62`  
**Severity:** High  
**CVSS:** 5.9 (AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

API keys are sent from the browser to the Express server as plain JSON:

```ts
setKey: async (agentId, apiKey) => {
  const res = await fetch(`/api/db/agents/${agentId}/api-key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
}
```

While the connection is to `localhost`, the key is exposed:
- In browser DevTools network tab (if Electron DevTools is open)
- To any local process that can sniff loopback traffic
- In any proxy or debugging middleware
- In potential XSS attack — JavaScript in the renderer can intercept `fetch` calls

**Recommendations:**
- Consider encrypting the API key on the client side before transmission (using a key derived from a user-provided passphrase)
- Implement a key-derivation approach where the key is never sent to the server at all — instead, derive a non-reversible token client-side
- At minimum, add a warning in the UI that the key will be transmitted over loopback
- Strip API keys from DevTools network logging (not easily possible, but worth noting)

---

#### [H4] No Rate Limiting or Request Throttling

**File:** `server/index.ts` (all endpoints)  
**Severity:** High  
**CVSS:** 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L)

None of the API endpoints implement rate limiting. An attacker or bug could:
- Flood `/api/chat` with requests, exhausting LLM API credits (financial DoS)
- Rapidly create/delete agents/conversations causing DB corruption
- Trigger excessive MCP server connections via `/api/mcp/test`

The 120s server-side timeout on chat requests (`server/index.ts:369-372`) provides some protection but doesn't prevent flooding.

**Recommendations:**
- Add `express-rate-limit` middleware, especially on:
  - `/api/chat` — strict limits (e.g., 10 req/min per user)
  - `/api/mcp/test` — 5 req/min
  - `/api/extract-memories` — 10 req/min
- Add request size validation middleware (body parser limit exists at 50MB but no per-route limits)

---

#### [H5] No Content Security Policy (CSP) Headers

**Files:** `server/index.ts`, `electron/main.ts`  
**Severity:** High  
**CVSS:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)

No CSP headers are set on Express responses or Electron's web preferences. The Electron window loads remote content in dev mode (`http://localhost:5173`) and the Markdown renderer (`react-markdown`) processes LLM-generated content, which could potentially include malicious scripts.

**Recommendations:**
- Set CSP headers via Express middleware:
  ```ts
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
    next()
  })
  ```
- Set CSP in Electron's `webPreferences` or via `session.defaultSession.webRequest.onHeadersReceived`
- Consider using `DOMPurify` or `rehype-sanitize` on rendered Markdown to prevent script injection

---

### MEDIUM

#### [M1] File-Reader/Writer Can Access Any File on the System

**Files:** `server/tools/file-reader.ts:22`, `server/tools/file-writer.ts:18`, `server/tools/pdf-reader.ts:17`  
**Severity:** Medium  
**CVSS:** 5.5 (AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)

While the tools use `path.resolve()` (preventing path traversal with `../`), an absolute path to any file can still be provided. The LLM could be tricked into reading sensitive files:
- `~/.ssh/id_rsa`
- `~/.aws/credentials`
- `~/.llm-chat/data.db` (the encrypted database)
- `/etc/passwd`, `/etc/shadow`

There's no workspace restriction — the tool description says "absolute path to the file" which implies full access.

**Recommendations:**
- Implement a configurable workspace root (defaulting to `~/.llm-chat/workspace/`)
- Reject paths outside the workspace root using `path.relative()` validation
- Add a deny-list for sensitive paths (`~/.ssh`, `~/.aws`, `/etc`, etc.)
- If full filesystem access must remain, add a prominent warning and audit logging

---

#### [M2] Encryption Decrypt Falls Back to Plaintext Silently

**File:** `server/crypto.ts:36-39`  
**Severity:** Medium  
**CVSS:** 4.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N)

```ts
} catch {
  // If decryption fails (e.g. migrated from another machine), return as-is
  return ciphertext
}
```

When decryption fails, the function silently returns the (potentially corrupted or wrong-key) ciphertext as if it were the plaintext. This could:
- Mask data corruption
- Return garbage data that silently corrupts the application state
- Leak ciphertext/encrypted values through the application if they get used

**Recommendations:**
- Log a warning when decryption fails
- Return `null` or `undefined` instead of the ciphertext so callers can distinguish "no key" from "key decryption failed"
- Add an error indicator in the UI when stored keys cannot be decrypted

---

#### [M3] No CSRF Protection

**File:** `server/index.ts` (all POST/PUT/DELETE routes)  
**Severity:** Medium  
**CVSS:** 4.3 (AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N)

All API endpoints accept JSON requests from any origin (due to C3). While token-based CSRF is less relevant for JSON APIs, the lack of any CSRF protection combined with permissive CORS means a malicious webpage could:

1. POST to `/api/db/agents` to create rogue agents
2. DELETE conversations or agents
3. Modify MCP server configurations

**Recommendations:**
- Add a custom request header check (e.g., `X-Requested-With`) for state-changing requests
- Implement Origin/Referer header validation as a second layer
- Use SameSite=Strict for any future cookie usage

---

#### [M4] No Security Event Audit Logging

**File:** All server files  
**Severity:** Medium  
**CVSS:** 3.0 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L)

The application does not log security-relevant events:
- API key creation/modification/deletion
- File write operations and their paths
- Shell command execution and their content
- MCP server connections and tool invocations
- Authentication/authorization failures

Without audit logging, security incidents cannot be investigated or detected.

**Recommendations:**
- Add structured logging (JSON format) for security events with timestamps and relevant context
- Log to a dedicated audit file (e.g., `~/.llm-chat/audit.log`)
- Include: event type, timestamp, agent ID, tool name, resource accessed, success/failure
- Never log the actual API key values — log only the fact that a key was set/cleared

---

#### [M5] MCP Presets Can Execute Arbitrary Commands

**File:** `server/mcp-presets.ts`  
**Severity:** Medium  
**CVSS:** 5.0 (AV:L/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:L)

MCP presets are pre-configured server definitions that users can add with one click. If a preset includes a `stdio` transport with a command like `npx`, the user is effectively running arbitrary code from the npm registry. While this is the intended MCP workflow, there's no warning about the security implications.

**Recommendations:**
- Add a security warning when adding MCP preset servers (especially stdio/npx-based ones)
- Display the exact command that will be executed before adding the server
- Validate that preset commands exist on the system before adding them
- Consider requiring explicit approval for presets that use `npx`

---

### LOW

#### [L1] No HTTPS in Development Mode

**Files:** `server/index.ts:785-803`, `vite.config.ts`  
**Severity:** Low  
**CVSS:** 2.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N)

The Express server listens on plain HTTP (`http://localhost:3001`) with no TLS. While this is standard for localhost development, it means API keys and conversation data are transmitted unencrypted over the loopback interface.

**Recommendations:**
- This is acceptable for a local-only desktop app — document it as a known limitation
- Consider adding an option for TLS with self-signed certificates for users who want defense-in-depth
- In Electron production mode, consider using `protocol.registerSchemesAsPrivileged` to create a custom secure scheme

---

## Summary Table

| ID | Title | Severity | Component |
|----|-------|----------|-----------|
| C1 | Arbitrary shell command execution | Critical | Code Executor |
| C2 | SSRF via web-fetch | Critical | Web Fetch Tool |
| C3 | Overly permissive CORS | Critical | Express Server |
| H1 | Process env leaked to MCP | High | MCP Manager |
| H2 | Predictable encryption key | High | Crypto |
| H3 | Plaintext API key transmission | High | API Key Store |
| H4 | No rate limiting | High | Express Server |
| H5 | No CSP headers | High | Express/Electron |
| M1 | File tools unrestricted access | Medium | File Reader/Writer |
| M2 | Silent decrypt fallback | Medium | Crypto |
| M3 | No CSRF protection | Medium | Express Server |
| M4 | No audit logging | Medium | All server |
| M5 | MCP preset command execution | Medium | MCP Presets |
| L1 | No HTTPS | Low | Express Server |

---

## Positive Security Practices Observed

The codebase also demonstrates several good security practices worth acknowledging:

1. **API keys encrypted at rest** — Keys stored in SQLite are AES-256-GCM encrypted (`server/crypto.ts`, `server/api-keys.ts`)
2. **DB-level encryption with master password** — Optional full-database encryption with scrypt key derivation (`server/db-encryption.ts`)
3. **Key cache uses hashed password** — The key derivation cache keys by SHA-256 of the password, avoiding plaintext passwords in Map keys (`server/db-encryption.ts:33-35`)
4. **Client stores only key presence, not values** — `api-key-store.ts` stores boolean flags, not the actual keys
5. **Structured output for LLM calls** — Uses `jsonSchema` with type-safe schemas for tool inputs
6. **Context isolation enabled in Electron** — `contextIsolation: true, nodeIntegration: false` in `electron/main.ts:107-108`
7. **Minimal preload script** — Only exposes `platform` and `isElectron` via `contextBridge`
8. **External links open in system browser** — `shell.openExternal(url)` in `electron/main.ts:120-123`
9. **Parameterized SQL queries** — All queries use `$param` named parameters, preventing SQL injection
10. **File path resolution** — Tools use `path.resolve()` to prevent basic path traversal attacks
11. **Timeout on all external operations** — Fetch, code execution, and Bedrock streaming all have timeouts
12. **Image filtering for unsupported providers** — `filterImagesFromMessages()` prevents sending image data to providers that don't support it
13. **Tool risk classification** — Tools categorized as safe/costly/destructive with appropriate default execution policies

---

## Recommendations by Priority

### Immediate (address before next release)
1. Fix CORS to restrict origins (C3)
2. Add SSRF protection to web-fetch and web-search (C2)
3. Sanitize `process.env` before passing to MCP child processes (H1)

### Short-term (next 1-2 sprints)
4. Implement rate limiting on key endpoints (H4)
5. Add CSP headers (H5)
6. Add workspace restrictions to file tools (M1)
7. Add security audit logging (M4)
8. Add MCP preset security warning (M5)

### Medium-term (within 1-3 months)
9. Evaluate sandboxing for code-executor or making it opt-in (C1)
10. Strengthen default encryption or require master password (H2)
11. Add client-side key encryption before transmission (H3)
12. Fix silent decrypt fallback (M2)
13. Add CSRF protection (M3)

---

*This audit was performed via automated code analysis. It may not cover runtime behavior, dependency vulnerabilities, or social engineering risks. A penetration test is recommended for production deployments.*
