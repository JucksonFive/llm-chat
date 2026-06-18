import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockedUrlError,
  isBlockedIp,
  MAX_REDIRECT_DEPTH,
  safeFetch,
  validateUrl,
} from './url-validator.js'

// dns/promises.lookup is mocked per-test so we can simulate hostname resolution
// without real network access.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup } from 'node:dns/promises'
const mockLookup = vi.mocked(lookup)

function resolvesTo(...ips: string[]) {
  mockLookup.mockResolvedValue(ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('isBlockedIp', () => {
  it('blocks private/reserved IPv4 ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1',
      '224.0.0.1',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
  })

  it('allows public IPv4 addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(false)
    }
  })

  it('blocks IPv6 loopback/ULA/link-local', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
  })

  it('allows public IPv6 addresses', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false)
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('validateUrl — protocols', () => {
  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com', 'data:text/html,hi'])(
    'blocks non-http(s) protocol %s',
    async (url) => {
      const result = await validateUrl(url)
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/protocol/i)
    },
  )

  it('rejects malformed URLs', async () => {
    const result = await validateUrl('not a url')
    expect(result.ok).toBe(false)
  })
})

describe('validateUrl — dangerous hostnames', () => {
  it.each([
    'http://localhost/',
    'http://localhost:3001/api/db/agents',
    'http://foo.local/',
    'http://metadata.google.internal/',
    'http://anything.internal/',
  ])('blocks %s without DNS lookup', async (url) => {
    const result = await validateUrl(url)
    expect(result.ok).toBe(false)
    expect(mockLookup).not.toHaveBeenCalled()
  })
})

describe('validateUrl — IP literals', () => {
  it('blocks IPv4 literal in private range', async () => {
    const result = await validateUrl('http://169.254.169.254/latest/meta-data/')
    expect(result.ok).toBe(false)
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('blocks IPv6 loopback literal', async () => {
    const result = await validateUrl('http://[::1]:8080/')
    expect(result.ok).toBe(false)
  })

  it('allows a public IPv4 literal', async () => {
    const result = await validateUrl('http://8.8.8.8/')
    expect(result.ok).toBe(true)
  })
})

describe('validateUrl — DNS rebinding defense', () => {
  it('blocks a hostname that resolves to a private IP', async () => {
    resolvesTo('10.1.2.3')
    const result = await validateUrl('http://evil.example.com/')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/blocked IP/i)
  })

  it('blocks when ANY resolved IP is private', async () => {
    resolvesTo('8.8.8.8', '127.0.0.1')
    const result = await validateUrl('http://mixed.example.com/')
    expect(result.ok).toBe(false)
  })

  it('allows a hostname resolving only to public IPs', async () => {
    resolvesTo('93.184.216.34')
    const result = await validateUrl('https://example.com/')
    expect(result.ok).toBe(true)
  })

  it('blocks when DNS resolution fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND') as never)
    const result = await validateUrl('https://nope.example.com/')
    expect(result.ok).toBe(false)
  })

  it('blocks when there are no DNS records', async () => {
    resolvesTo()
    const result = await validateUrl('https://empty.example.com/')
    expect(result.ok).toBe(false)
  })
})

describe('safeFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws BlockedUrlError for an SSRF target without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(safeFetch('http://169.254.169.254/')).rejects.toBeInstanceOf(BlockedUrlError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches a public URL successfully', async () => {
    resolvesTo('93.184.216.34')
    const ok = new Response('hello', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok)
    const res = await safeFetch('https://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
  })

  it('follows a safe redirect and re-validates the new URL', async () => {
    resolvesTo('93.184.216.34')
    const redirect = new Response(null, { status: 302, headers: { location: 'https://example.com/final' } })
    const final = new Response('done', { status: 200 })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(final)
    const res = await safeFetch('https://example.com/start')
    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('blocks a redirect that points at an internal host', async () => {
    // First hostname is public; redirect target is the metadata IP.
    resolvesTo('93.184.216.34')
    const redirect = new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect)
    await expect(safeFetch('https://example.com/start')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('caps redirect depth at MAX_REDIRECT_DEPTH', async () => {
    resolvesTo('93.184.216.34')
    // Always redirect to a new safe URL -> should eventually error on depth.
    let n = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n += 1
      return new Response(null, { status: 302, headers: { location: `https://example.com/${n}` } })
    })
    await expect(safeFetch('https://example.com/start')).rejects.toBeInstanceOf(BlockedUrlError)
    expect(n).toBeLessThanOrEqual(MAX_REDIRECT_DEPTH + 1)
  })
})
