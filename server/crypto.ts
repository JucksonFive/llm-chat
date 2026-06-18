import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// API-key field encryption (AES-256-GCM).
//
// Key resolution order:
//   1. LLM_CHAT_MASTER_PASSWORD env var (preferred, user-controlled secret).
//   2. Machine-key fallback: a key derived from machine attributes PLUS a
//      persistent random salt stored at ~/.llm-chat/.keysalt (0600). The random
//      salt makes the fallback key non-guessable from hostname/username alone.
//   3. Legacy machine key (no random salt) — used ONLY as a decryption fallback
//      so secrets encrypted before this change can still be read.
//
// FOLLOW-UPS (deferred — see PR body):
//   - Integrate an OS keychain (keytar / libsecret / Keychain / Credential
//     Manager) to store a randomly generated key instead of a machine-derived
//     one. keytar is a native dependency and is intentionally NOT added here.
//   - Make a master password mandatory on first launch via an interactive
//     setup flow. Not suitable for the current headless/server start path.

const LEGACY_SALT = 'llm-chat-v1'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

// Resolved lazily (not at module load) so HOME changes are honored — important
// for tests that redirect HOME to a temp dir.
function getDataDir(): string {
  return path.join(os.homedir(), '.llm-chat')
}
function getKeysaltPath(): string {
  return path.join(getDataDir(), '.keysalt')
}

/**
 * Validate master-password strength: at least 8 chars, with lower-case,
 * upper-case and a digit. Returned for reuse elsewhere; callers decide whether
 * a failure is fatal. We only warn (never crash) so existing deployments with a
 * weak password keep working.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (password.length < 8) errors.push('must be at least 8 characters')
  if (!/[a-z]/.test(password)) errors.push('must contain a lowercase letter')
  if (!/[A-Z]/.test(password)) errors.push('must contain an uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('must contain a digit')
  return { valid: errors.length === 0, errors }
}

/**
 * Read the persistent random salt for the machine-key fallback, creating it on
 * first use. Stored with 0600 permissions. If the directory/file can't be
 * created (read-only FS, permission error) we fall back to an in-memory salt so
 * the process still functions, but such a salt won't survive a restart.
 */
let cachedRandomSalt: Buffer | null = null
function getOrCreateRandomSalt(): Buffer {
  if (cachedRandomSalt) return cachedRandomSalt
  const keysaltPath = getKeysaltPath()
  try {
    if (fs.existsSync(keysaltPath)) {
      const buf = fs.readFileSync(keysaltPath)
      if (buf.length >= 16) {
        cachedRandomSalt = buf
        return cachedRandomSalt
      }
      // Corrupt/short salt — regenerate below.
    }
    fs.mkdirSync(getDataDir(), { recursive: true })
    const salt = crypto.randomBytes(32)
    fs.writeFileSync(keysaltPath, salt, { mode: 0o600 })
    // Best-effort tighten perms in case the umask widened them on creation.
    try {
      fs.chmodSync(keysaltPath, 0o600)
    } catch {
      /* ignore */
    }
    cachedRandomSalt = salt
    return cachedRandomSalt
  } catch (err) {
    console.warn(
      '[crypto] Could not persist machine-key salt at ' +
        `${keysaltPath} (${(err as Error).message}). Using an ephemeral ` +
        'salt — encrypted secrets will not be readable after a restart.',
    )
    cachedRandomSalt = crypto.randomBytes(32)
    return cachedRandomSalt
  }
}

/** Derive the machine-key fallback key using the persistent random salt. */
function deriveSaltedMachineKey(): Buffer {
  const salt = getOrCreateRandomSalt()
  return crypto.scryptSync(
    `${os.hostname()}-${os.homedir()}-${LEGACY_SALT}`,
    salt,
    32,
  )
}

/** Legacy machine key (predictable salt) — decryption fallback only. */
function deriveLegacyMachineKey(): Buffer {
  return crypto.scryptSync(
    `${os.hostname()}-${os.homedir()}-${LEGACY_SALT}`,
    LEGACY_SALT,
    32,
  )
}

function deriveMasterPasswordKey(password: string): Buffer {
  return crypto.scryptSync(password, LEGACY_SALT, 32)
}

let warnedNoMasterPassword = false

/**
 * The primary key used for new encryptions. Resolved lazily so tests / runtime
 * can set LLM_CHAT_MASTER_PASSWORD before first use, and so the salt file is
 * only touched when encryption is actually needed.
 */
let cachedPrimaryKey: Buffer | null = null
function getPrimaryKey(): Buffer {
  if (cachedPrimaryKey) return cachedPrimaryKey
  const pw = process.env.LLM_CHAT_MASTER_PASSWORD
  if (pw && pw.trim()) {
    const strength = validatePasswordStrength(pw)
    if (!strength.valid) {
      console.warn(
        '[crypto] LLM_CHAT_MASTER_PASSWORD is weak: ' +
          `${strength.errors.join(', ')}. It will still be used, but a ` +
          'stronger password is strongly recommended.',
      )
    }
    cachedPrimaryKey = deriveMasterPasswordKey(pw)
    return cachedPrimaryKey
  }

  if (!warnedNoMasterPassword) {
    warnedNoMasterPassword = true
    console.warn(
      '[crypto] LLM_CHAT_MASTER_PASSWORD is not set. Falling back to a ' +
        'machine-derived key (salted with a random per-machine secret). ' +
        'Anyone with local file access can still decrypt stored API keys — ' +
        'set LLM_CHAT_MASTER_PASSWORD for stronger protection.',
    )
  }
  cachedPrimaryKey = deriveSaltedMachineKey()
  return cachedPrimaryKey
}

/**
 * All keys to try when decrypting, in order. Includes the primary key plus the
 * legacy machine key so data encrypted before this change keeps decrypting.
 */
function getDecryptionKeys(): Buffer[] {
  const keys = [getPrimaryKey()]
  const pw = process.env.LLM_CHAT_MASTER_PASSWORD
  // Only attempt machine-key fallbacks when no master password is configured;
  // a wrong master password should fail loudly rather than silently decrypt
  // with a machine key.
  if (!(pw && pw.trim())) {
    keys.push(deriveLegacyMachineKey())
  }
  return keys
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getPrimaryKey(), iv)
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
  const [ivB64, tagB64, encB64] = ciphertext.split(':')
  if (!ivB64 || !tagB64 || !encB64) {
    // Not our format — likely a plaintext/legacy value. Return as-is.
    return ciphertext
  }
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(encB64, 'base64')

  for (const key of getDecryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(encrypted) + decipher.final('utf8')
    } catch {
      // Try the next candidate key.
    }
  }
  // Decryption failed with every key (corrupt data, tampering, or a key from
  // another machine). Return null so callers can surface/log the failure
  // instead of silently propagating the ciphertext.
  return null
}

/**
 * Test-only: reset cached keys/salt so a test can change env vars between
 * cases. Not part of the public runtime API.
 */
export function __resetCryptoCachesForTests(): void {
  cachedPrimaryKey = null
  cachedRandomSalt = null
  warnedNoMasterPassword = false
}
