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

// Cache derived keys per (password, salt) pair. The DB load uses the salt
// embedded in the file; subsequent encryptions use a fresh random salt, so
// the cache must support multiple entries — but only a handful per process.
const keyCache = new Map<string, Buffer>()

function cacheKey(password: string, salt: Buffer): string {
  // Hash the password to avoid keeping it in a plain string Map key.
  const pwHash = crypto.createHash('sha256').update(password).digest('hex')
  return `${pwHash}:${salt.toString('hex')}`
}

function getOrDeriveKey(password: string, salt: Buffer): Buffer {
  const k = cacheKey(password, salt)
  const cached = keyCache.get(k)
  if (cached) return cached
  const key = deriveKey(password, salt)
  keyCache.set(k, key)
  return key
}

// Salt + derived key reused for every encryption in this process.
let processSalt: { password: string; salt: Buffer; key: Buffer } | null = null

function getOrCreateProcessSalt(password: string): { salt: Buffer; key: Buffer } {
  if (processSalt && processSalt.password === password) {
    return { salt: processSalt.salt, key: processSalt.key }
  }
  const salt = crypto.randomBytes(SALT_LEN)
  const key = getOrDeriveKey(password, salt)
  processSalt = { password, salt, key }
  return { salt, key }
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

  // Reuse the same (salt, derived key) for the lifetime of the process.
  // scryptSync at N=16384 takes ~100ms and saveToDisk runs every 5s, so
  // re-deriving on every save burned ~2% of a CPU core for no benefit
  // (each save still rotates IV + auth tag, so semantic security is fine).
  const { salt, key } = getOrCreateProcessSalt(password)
  const iv = crypto.randomBytes(IV_LEN)

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
