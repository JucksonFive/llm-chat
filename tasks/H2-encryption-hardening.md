# H2 — Strengthen Default Encryption or Require Master Password

**Severity:** High  
**CVSS:** 5.9 (AV:L/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:H)  
**Status:** Open  
**Files:** `server/crypto.ts`, `server/db-encryption.ts`  

## Problem

When `LLM_CHAT_MASTER_PASSWORD` is **not** set, API key encryption falls back to a key derived from predictable machine attributes:

```ts
// crypto.ts:7-10
const KEY = crypto.scryptSync(
  `${os.hostname()}-${os.homedir()}-${SALT}`,
  SALT,  // 'llm-chat-v1'
  32,
)
```

The code comment acknowledges the weakness: _"Not bulletproof, but much better than plaintext"_. An attacker with local file access who knows the hostname and username can decrypt stored API keys. On macOS, hostname is often `MacBook-Pro.local` and homedir is `/Users/<firstname>` — both guessable.

Similarly, `db-encryption.ts` uses `LLM_CHAT_MASTER_PASSWORD` only if set; otherwise the DB is stored unencrypted.

## Acceptance criteria

- [ ] On first launch (no existing DB), prompt the user to set a master password — make it mandatory, not optional
- [ ] OR: integrate with OS keychain (macOS Keychain / `libsecret` on Linux / Windows Credential Manager) to store a randomly-generated key
- [ ] Minimum password strength requirement (8+ chars, mixed case + digit)
- [ ] The existing `LLM_CHAT_MASTER_PASSWORD` env var still works as an override
- [ ] Migration path: unencrypted DBs are automatically re-encrypted on first launch after setting a password
- [ ] Tests: verify that a wrong master password fails decryption with a clear error; verify that changing the password re-encrypts with the new key

## Implementation notes

- The `keytar` npm package provides cross-platform keychain access
- Keep the machine-keyed fallback only as a last resort (and log a warning)
- Add an in-app settings section for changing the master password
- Changing the master password requires re-encrypting the DB
