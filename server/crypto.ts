import crypto from 'crypto'
import os from 'os'

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
const TAG_LENGTH = 16

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(ciphertext: string): string {
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
    // If decryption fails (e.g. migrated from another machine), return as-is
    return ciphertext
  }
}
