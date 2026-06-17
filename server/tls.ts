import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generate } from 'selfsigned'

function certsDir(): string {
  return path.join(os.homedir(), '.llm-chat', 'certs')
}

export interface TlsCredentials {
  key: string
  cert: string
}

/**
 * Whether the HTTPS mode is enabled via the HTTPS_ENABLED env var.
 * Disabled by default — requires explicit opt-in.
 */
export function isHttpsEnabled(): boolean {
  const value = process.env.HTTPS_ENABLED?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

/**
 * Generate a self-signed certificate valid for localhost / loopback.
 * Returns the key + cert as PEM strings. Does not touch disk.
 */
export async function generateSelfSignedCert(): Promise<TlsCredentials> {
  const attrs = [{ name: 'commonName', value: 'localhost' }]
  const pems = await generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
    // Valid for ~1 year.
    notAfterDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    extensions: [
      { name: 'basicConstraints', cA: false },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  })
  return { key: pems.private, cert: pems.cert }
}

/**
 * Load the self-signed cert from ~/.llm-chat/certs, generating and persisting
 * it on first use. Subsequent calls reuse the cached files.
 */
export async function ensureTlsCredentials(): Promise<TlsCredentials> {
  const dir = certsDir()
  const keyPath = path.join(dir, 'localhost-key.pem')
  const certPath = path.join(dir, 'localhost-cert.pem')

  try {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
      }
    }
  } catch {
    // Fall through and regenerate if reading the cached cert fails.
  }

  const credentials = await generateSelfSignedCert()
  fs.mkdirSync(dir, { recursive: true })
  // Restrict the private key to the owner only.
  fs.writeFileSync(keyPath, credentials.key, { mode: 0o600 })
  fs.writeFileSync(certPath, credentials.cert, { mode: 0o644 })
  return credentials
}
