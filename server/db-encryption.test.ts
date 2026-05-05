import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptDbBlob, decryptDbBlob, isEncryptedBlob, isEncryptionEnabled } from './db-encryption.js'

const ORIGINAL_PASSWORD = process.env.LLM_CHAT_MASTER_PASSWORD

function setPassword(pw: string | undefined) {
  if (pw === undefined) delete process.env.LLM_CHAT_MASTER_PASSWORD
  else process.env.LLM_CHAT_MASTER_PASSWORD = pw
}

beforeEach(() => {
  setPassword('test-password-for-tests')
})

afterEach(() => {
  setPassword(ORIGINAL_PASSWORD)
})

describe('isEncryptionEnabled', () => {
  it('reflects the env var', () => {
    setPassword('something')
    expect(isEncryptionEnabled()).toBe(true)
    setPassword(undefined)
    expect(isEncryptionEnabled()).toBe(false)
    setPassword('   ')
    expect(isEncryptionEnabled()).toBe(false)
  })
})

describe('encryptDbBlob / decryptDbBlob', () => {
  it('roundtrips plaintext when a password is set', () => {
    const plaintext = Buffer.from('SQLite format 3\0plus more bytes here')
    const encrypted = encryptDbBlob(plaintext)
    expect(isEncryptedBlob(encrypted)).toBe(true)
    expect(encrypted.subarray(0, 4).toString('utf8')).toBe('LCE1')
    const decrypted = decryptDbBlob(encrypted)
    expect(decrypted.equals(plaintext)).toBe(true)
  })

  it('returns plaintext untouched when no password is set', () => {
    setPassword(undefined)
    const plaintext = Buffer.from('hello')
    const encrypted = encryptDbBlob(plaintext)
    expect(encrypted.equals(plaintext)).toBe(true)
  })

  it('produces different ciphertexts on each call (unique IV)', () => {
    const plaintext = Buffer.from('same input every time')
    const a = encryptDbBlob(plaintext)
    const b = encryptDbBlob(plaintext)
    expect(a.equals(b)).toBe(false)
  })

  it('reuses the same salt across saves within a process (cache benefit)', () => {
    // Salt sits at offset 4..20 in the LCE1 envelope.
    const a = encryptDbBlob(Buffer.from('one'))
    const b = encryptDbBlob(Buffer.from('two'))
    const saltA = a.subarray(4, 20)
    const saltB = b.subarray(4, 20)
    expect(saltA.equals(saltB)).toBe(true)
  })

  it('throws on wrong password', () => {
    const plaintext = Buffer.from('secret data')
    const encrypted = encryptDbBlob(plaintext)
    setPassword('wrong-password')
    expect(() => decryptDbBlob(encrypted)).toThrow(/master password is likely incorrect/i)
  })

  it('throws when encrypted blob is given but no password is set', () => {
    const encrypted = encryptDbBlob(Buffer.from('data'))
    setPassword(undefined)
    expect(() => decryptDbBlob(encrypted)).toThrow(/LLM_CHAT_MASTER_PASSWORD/)
  })

  it('returns plaintext blob as-is for backward compatibility', () => {
    const plaintext = Buffer.from('SQLite format 3\0unencrypted db')
    const result = decryptDbBlob(plaintext)
    expect(result.equals(plaintext)).toBe(true)
  })
})

describe('isEncryptedBlob', () => {
  it('detects the LCE1 magic', () => {
    expect(isEncryptedBlob(Buffer.from('LCE1...'))).toBe(true)
  })

  it('rejects plaintext SQLite headers', () => {
    expect(isEncryptedBlob(Buffer.from('SQLite f'))).toBe(false)
  })

  it('handles short buffers', () => {
    expect(isEncryptedBlob(Buffer.from('LC'))).toBe(false)
  })
})
