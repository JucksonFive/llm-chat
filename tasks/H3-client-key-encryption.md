# H3 — Encrypt API Keys Client-Side Before Transmission

**Severity:** High  
**CVSS:** 5.9 (AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)  
**Status:** Open  
**Files:** `src/stores/api-key-store.ts`, `server/db-routes.ts`  

## Problem

API keys are sent in plaintext JSON from the browser to the Express server:

```ts
// api-key-store.ts:59
body: JSON.stringify({ apiKey }),
```

The key traverses the loopback interface unencrypted. It can be intercepted by:
- DevTools network tab (if open)
- Local process sniffing loopback
- XSS in the renderer intercepting `fetch`

## Acceptance criteria

- [ ] On the client: encrypt the API key with a per-session random key before sending
- [ ] The session key is derived from a user-provided passphrase or a randomly-generated token stored in memory (not localStorage)
- [ ] The server never sees the plaintext key — it stores the already-encrypted blob, which is only decrypted in-memory at usage time
- [ ] OR: adopt a design where the API key is never sent to the server — the server uses a session-scoped reference token, and the actual key stays in the renderer process
- [ ] Tests: verify that `apiKey` does not appear in plaintext in request bodies

## Implementation notes

- This is a design change with significant complexity. Consider phasing it:
  1. Short-term: add a warning in the UI that the key is transmitted over loopback
  2. Medium-term: wrap the key in a session-scoped encryption that the server decrypts on first use and keeps in memory
  3. Long-term: keep keys entirely client-side, pass a reference token
- The "long-term" approach conflicts with multi-provider routing in `server/index.ts` which needs the actual key
