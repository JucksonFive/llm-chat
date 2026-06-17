import crypto from 'node:crypto'
import os from 'node:os'

// Derive a stable encryption key from machine-specific data
// Not bulletproof, but much better than plaintext
const SALT = 'llm-chat-v1'
const KEY = crypto.scryptSync(
  `${os.hostname()}-${os.homedir()}-${SALT}`,
  SALT,
  32,
)

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypt a ciphertext produced by {@link encrypt}.
 *
 * Returns:
 * - `''` for empty input (no value stored)
 * - the decrypted plaintext on success
 * - `null` on failure (corrupt data, tampering, or a key from another machine)
 *
 * NOTE: this previously returned the raw ciphertext on failure, which silently
 * leaked garbage downstream (e.g. used as an API key). Callers MUST handle the
 * `null` case explicitly.
 */
export function decrypt(ciphertext: string): string | null {
  if (!ciphertext) return ''
  try {
    const [ivB64, tagB64, encB64] = ciphertext.split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const encrypted = Buffer.from(encB64, 'base64')
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  } catch {
    // Decryption failed: corrupt data, tampering, or a key encrypted on a
    // different machine. Return null so callers can surface/log the failure
    // instead of silently propagating the ciphertext.
    return null
  }
}
