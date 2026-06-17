import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_HTTPS = process.env.HTTPS_ENABLED

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-chat-tls-'))
  process.env.HOME = tmpHome
})

afterEach(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_HTTPS === undefined) delete process.env.HTTPS_ENABLED
  else process.env.HTTPS_ENABLED = ORIGINAL_HTTPS
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const { isHttpsEnabled, generateSelfSignedCert, ensureTlsCredentials } = await import('./tls.js')

describe('isHttpsEnabled', () => {
  it('is disabled by default', () => {
    delete process.env.HTTPS_ENABLED
    expect(isHttpsEnabled()).toBe(false)
  })

  it.each(['1', 'true', 'TRUE', 'yes'])('is enabled when HTTPS_ENABLED=%s', (value) => {
    process.env.HTTPS_ENABLED = value
    expect(isHttpsEnabled()).toBe(true)
  })

  it.each(['0', 'false', 'no', ''])('stays disabled for HTTPS_ENABLED=%s', (value) => {
    process.env.HTTPS_ENABLED = value
    expect(isHttpsEnabled()).toBe(false)
  })
})

describe('generateSelfSignedCert', () => {
  it('returns key and cert PEMs', async () => {
    const { key, cert } = await generateSelfSignedCert()
    expect(key).toContain('-----BEGIN')
    expect(key).toContain('PRIVATE KEY-----')
    expect(cert).toContain('-----BEGIN CERTIFICATE-----')
    expect(cert).toContain('-----END CERTIFICATE-----')
  })
})

describe('ensureTlsCredentials', () => {
  it('generates and persists the cert under ~/.llm-chat/certs', async () => {
    const certsDir = path.join(tmpHome, '.llm-chat', 'certs')
    const creds = await ensureTlsCredentials()
    expect(creds.key).toContain('PRIVATE KEY-----')
    expect(creds.cert).toContain('CERTIFICATE-----')
    expect(fs.existsSync(path.join(certsDir, 'localhost-key.pem'))).toBe(true)
    expect(fs.existsSync(path.join(certsDir, 'localhost-cert.pem'))).toBe(true)
  })

  it('reuses the cached cert on subsequent calls', async () => {
    const first = await ensureTlsCredentials()
    const second = await ensureTlsCredentials()
    expect(second.key).toBe(first.key)
    expect(second.cert).toBe(first.cert)
  })
})
