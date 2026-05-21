import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from './crypto.js'

describe('encrypt / decrypt', () => {
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

  it('returns the input as-is when decryption fails (cross-machine fallback)', () => {
    // Truly garbled input should fall through to the catch and return the
    // original ciphertext — supports migration from another machine.
    expect(decrypt('not-base64::format')).toBe('not-base64::format')
    expect(decrypt('plain text key')).toBe('plain text key')
  })

  it('handles a tampered tag by returning the original ciphertext', () => {
    const enc = encrypt('hello')
    const parts = enc.split(':')
    parts[1] = Buffer.from('tampered-tag-bytes-padding').toString('base64')
    const tampered = parts.join(':')
    // Auth check fails → catch returns the input unchanged.
    expect(decrypt(tampered)).toBe(tampered)
  })
})
