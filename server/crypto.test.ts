import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decrypt, encrypt, validatePasswordStrength, __resetCryptoCachesForTests } from './crypto.js'

const ORIGINAL_PW = process.env.LLM_CHAT_MASTER_PASSWORD

// Redirect ~/.llm-chat to a temp dir so the .keysalt file never touches the
// real home directory.
let tmpHome: string
let homeSpy: string | undefined

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-chat-crypto-'))
  homeSpy = process.env.HOME
  process.env.HOME = tmpHome
  // os.homedir() reads HOME on POSIX; force USERPROFILE too for safety.
  process.env.USERPROFILE = tmpHome
  delete process.env.LLM_CHAT_MASTER_PASSWORD
  __resetCryptoCachesForTests()
})

afterEach(() => {
  if (ORIGINAL_PW === undefined) delete process.env.LLM_CHAT_MASTER_PASSWORD
  else process.env.LLM_CHAT_MASTER_PASSWORD = ORIGINAL_PW
  if (homeSpy === undefined) delete process.env.HOME
  else process.env.HOME = homeSpy
  __resetCryptoCachesForTests()
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('encrypt / decrypt (machine-key fallback)', () => {
  it('roundtrips plaintext', () => {
    const plain = 'sk-test-1234567890'
    const enc = encrypt(plain)
    expect(enc).not.toBe(plain)
    expect(enc.split(':')).toHaveLength(3)
    expect(decrypt(enc)).toBe(plain)
  })

  it('roundtrips unicode', () => {
    const plain = 'salasäänä-äöü-🚀'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('returns "" for empty input', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('produces different ciphertexts on each call (random IV)', () => {
    const a = encrypt('same')
    const b = encrypt('same')
    expect(a).not.toBe(b)
  })

  it('returns the input as-is for legacy plaintext values (not in iv:tag:enc format)', () => {
    // Legacy/plaintext values that don't match the iv:tag:enc format are returned as-is
    // for backward compatibility (e.g. keys stored before encryption was added).
    expect(decrypt('not-base64::format')).toBe('not-base64::format')
    expect(decrypt('plain text key')).toBe('plain text key')
  })

  it('returns null when the auth tag is tampered with', () => {
    const enc = encrypt('hello')
    const parts = enc.split(':')
    parts[1] = Buffer.from('tampered-tag-bytes-padding').toString('base64')
    const tampered = parts.join(':')
    // Auth check fails → null, not the input (no longer leaks ciphertext).
    expect(decrypt(tampered)).toBeNull()
  })

  it('persists a random salt file at ~/.llm-chat/.keysalt with 0600 perms', () => {
    encrypt('trigger key derivation')
    const saltPath = path.join(tmpHome, '.llm-chat', '.keysalt')
    expect(fs.existsSync(saltPath)).toBe(true)
    expect(fs.readFileSync(saltPath).length).toBeGreaterThanOrEqual(16)
    // Skip mode assertion on platforms without POSIX perms.
    if (process.platform !== 'win32') {
      const mode = fs.statSync(saltPath).mode & 0o777
      expect(mode).toBe(0o600)
    }
  })
})

describe('encrypt / decrypt (master password)', () => {
  it('roundtrips with a master password set', () => {
    process.env.LLM_CHAT_MASTER_PASSWORD = 'Str0ngPassword'
    __resetCryptoCachesForTests()
    const enc = encrypt('secret-value')
    expect(decrypt(enc)).toBe('secret-value')
  })

  it('fails to decrypt (returns ciphertext as-is) with the wrong master password', () => {
    process.env.LLM_CHAT_MASTER_PASSWORD = 'Str0ngPassword'
    __resetCryptoCachesForTests()
    const enc = encrypt('secret-value')

    process.env.LLM_CHAT_MASTER_PASSWORD = 'Different1Password'
    __resetCryptoCachesForTests()
    // A wrong master password must NOT silently recover the plaintext.
    const out = decrypt(enc)
    expect(out).not.toBe('secret-value')
    expect(out).toBe(enc)
  })

  it('does not fall back to the machine key when a master password is set', () => {
    // Encrypt with the machine-key fallback (no password)...
    const machineEnc = encrypt('machine-secret')
    // ...then set a password and confirm we do NOT decrypt the machine blob.
    process.env.LLM_CHAT_MASTER_PASSWORD = 'Str0ngPassword'
    __resetCryptoCachesForTests()
    expect(decrypt(machineEnc)).not.toBe('machine-secret')
  })
})

describe('validatePasswordStrength', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('Abcdef12').valid).toBe(true)
  })

  it('rejects short passwords', () => {
    const r = validatePasswordStrength('Ab1')
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('must be at least 8 characters')
  })

  it('requires lowercase, uppercase and a digit', () => {
    expect(validatePasswordStrength('ABCDEF12').valid).toBe(false) // no lowercase
    expect(validatePasswordStrength('abcdef12').valid).toBe(false) // no uppercase
    expect(validatePasswordStrength('Abcdefgh').valid).toBe(false) // no digit
  })
})
