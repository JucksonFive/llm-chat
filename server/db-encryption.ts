import crypto from 'node:crypto'

// File format for encrypted DB dump:
// [MAGIC(4) "LCE1"] [SALT(16)] [IV(12)] [TAG(16)] [CIPHERTEXT...]
// Plain SQLite files start with the bytes "SQLite f" so the magic will never
// collide with an unencrypted DB.

const MAGIC = Buffer.from('LCE1', 'utf8') // LLM-Chat Encrypted v1
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const ALGO = 'aes-256-gcm'

function getPassword(): string | null {
  const pw = process.env.LLM_CHAT_MASTER_PASSWORD
  if (!pw || !pw.trim()) return null
  return pw
}

function deriveKey(password: string, salt: Buffer): Buffer {
  // scryptSync is CPU-bound (~100ms) but we only run it twice per process
  // (once on load, once on every save — saveToDisk fires every 5s, so cache).
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
}

let cachedKey: { salt: Buffer; key: Buffer } | null = null

function getOrDeriveKey(password: string, salt: Buffer): Buffer {
  if (cachedKey && cachedKey.salt.equals(salt)) return cachedKey.key
  const key = deriveKey(password, salt)
  cachedKey = { salt, key }
  return key
}

export function isEncryptionEnabled(): boolean {
  return getPassword() !== null
}

export function isEncryptedBlob(buf: Buffer): boolean {
  return buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC)
}

export function encryptDbBlob(plaintext: Buffer): Buffer {
  const password = getPassword()
  if (!password) return plaintext

  const salt = crypto.randomBytes(SALT_LEN)
  const iv = crypto.randomBytes(IV_LEN)
  const key = getOrDeriveKey(password, salt)

  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([MAGIC, salt, iv, tag, ciphertext])
}

export function decryptDbBlob(buf: Buffer): Buffer {
  if (!isEncryptedBlob(buf)) {
    // Plaintext DB — return as-is for backward compatibility.
    if (isEncryptionEnabled()) {
      console.warn(
        '[db-encryption] DB file is unencrypted but LLM_CHAT_MASTER_PASSWORD is set. ' +
          'It will be re-saved encrypted on the next write.',
      )
    }
    return buf
  }

  const password = getPassword()
  if (!password) {
    throw new Error(
      'DB file is encrypted but LLM_CHAT_MASTER_PASSWORD env var is not set. ' +
        'Set it to the password that was used to encrypt the DB.',
    )
  }

  let offset = MAGIC.length
  const salt = buf.subarray(offset, offset + SALT_LEN); offset += SALT_LEN
  const iv = buf.subarray(offset, offset + IV_LEN); offset += IV_LEN
  const tag = buf.subarray(offset, offset + TAG_LEN); offset += TAG_LEN
  const ciphertext = buf.subarray(offset)

  const key = getOrDeriveKey(password, salt)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch (err) {
    throw new Error(
      'Failed to decrypt DB file — master password is likely incorrect. ' +
        `Underlying error: ${(err as Error).message}`,
    )
  }
}
