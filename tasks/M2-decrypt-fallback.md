# M2 — Fix Silent Decrypt Fallback Returning Ciphertext

**Severity:** Medium  
**CVSS:** 4.0 (AV:L/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N)  
**Status:** Open  
**File:** `server/crypto.ts`  

## Problem

When decryption fails, the `decrypt()` function silently returns the ciphertext as-is:

```ts
// crypto.ts:36-39
} catch {
  // If decryption fails (e.g. migrated from another machine), return as-is
  return ciphertext
}
```

This can:
- Mask data corruption
- Return garbage/ciphertext through the application (e.g., used as an API key → confusing errors)
- Hide genuine decryption failures from the user

## Acceptance criteria

- [ ] `decrypt()` returns `null` on failure instead of the ciphertext
- [ ] All callers (`getAgentApiKey`, `findApiKeyForProvider` in `api-keys.ts`) handle `null`:
  - Return empty string `''` as before (no key available)
  - Log a warning: `[crypto] Failed to decrypt API key for agent <id> — key may be corrupted or from another machine`
- [ ] If `LLM_CHAT_MASTER_PASSWORD` is set and decryption fails → show a user-visible error in the UI rather than silently continuing
- [ ] Tests: new test case in `server/crypto.test.ts` verifying that corrupt ciphertext returns `null`
- [ ] Tests: verify that `findApiKeyForProvider` and `getAgentApiKey` handle `null` gracefully

## Implementation notes

- This is a breaking behavior change for the `decrypt` function — audit all callers
- The migration path: old keys encrypted with the machine-key (without master password) will fail to decrypt after this change if the machine changed. The fix is to re-enter the API key.
