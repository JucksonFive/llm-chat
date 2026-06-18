import { describe, expect, it } from 'vitest'
import { API_KEY_TRANSPORT_WARNING } from './api-key-transport'

describe('API_KEY_TRANSPORT_WARNING', () => {
  it('is a non-empty user-facing string', () => {
    expect(typeof API_KEY_TRANSPORT_WARNING).toBe('string')
    expect(API_KEY_TRANSPORT_WARNING.trim().length).toBeGreaterThan(0)
  })

  it('honestly conveys that the key is transmitted to the local server', () => {
    const text = API_KEY_TRANSPORT_WARNING.toLowerCase()
    expect(text).toContain('loopback')
    // Must mention it is sent / transmitted to the server, not implied to be local-only.
    expect(text).toContain('sent')
  })

  it('does not contain or leak an actual secret value', () => {
    // Guard against accidentally embedding a real-looking key in the copy.
    expect(API_KEY_TRANSPORT_WARNING).not.toMatch(/sk-[A-Za-z0-9]{16,}/)
  })
})
