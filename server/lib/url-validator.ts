import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * SSRF protection: validates that a URL is safe to fetch from a server-side
 * context. Blocks non-HTTP(S) protocols, dangerous hostnames, and any URL whose
 * hostname resolves to a private/reserved/loopback/link-local IP address.
 *
 * Used by the `web-fetch` and `web-search` tools, both of which fetch arbitrary
 * URLs that may originate from an LLM or from search results.
 */

export interface UrlValidationResult {
  ok: boolean
  reason?: string
  /** Hostname extracted from the URL (lower-cased). */
  hostname?: string
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** Hostnames that are always blocked regardless of DNS resolution. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
])

/** Hostname suffixes that are always blocked (e.g. mDNS `.local`). */
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.localhost', '.internal']

/**
 * Returns true if the given IPv4 address string is in a private, reserved,
 * loopback, link-local, or otherwise non-routable range.
 */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    // Not a well-formed IPv4 — treat as blocked to be safe.
    return true
  }
  const [a, b] = parts

  // 0.0.0.0/8 — "this" network / unspecified
  if (a === 0) return true
  // 10.0.0.0/8 — private
  if (a === 10) return true
  // 127.0.0.0/8 — loopback
  if (a === 127) return true
  // 169.254.0.0/16 — link-local (incl. cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 — private
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true
  // 100.64.0.0/10 — carrier-grade NAT / shared address space
  if (a === 100 && b >= 64 && b <= 127) return true
  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && parts[2] === 0) return true
  // 198.18.0.0/15 — benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true
  // 224.0.0.0/4 — multicast, 240.0.0.0/4 — reserved
  if (a >= 224) return true

  return false
}

/**
 * Returns true if the given IPv6 address string is loopback, unique-local,
 * link-local, unspecified, or an IPv4-mapped address that maps to a blocked
 * IPv4 range.
 */
function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')

  // Loopback ::1 and unspecified ::
  if (lower === '::1' || lower === '::') return true

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible addresses
  const mapped = lower.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped) {
    return isBlockedIPv4(mapped[1])
  }

  // Expand only the leading hextet group for prefix checks.
  const firstGroup = lower.split(':')[0] ?? ''
  const firstWord = Number.parseInt(firstGroup || '0', 16)

  // fc00::/7 — unique local addresses (fc00 – fdff)
  if (firstWord >= 0xfc00 && firstWord <= 0xfdff) return true
  // fe80::/10 — link-local (fe80 – febf)
  if (firstWord >= 0xfe80 && firstWord <= 0xfebf) return true

  return false
}

/** Returns true if the IP (v4 or v6) is in a blocked range. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return isBlockedIPv4(ip)
  if (kind === 6) return isBlockedIPv6(ip)
  // Not a valid IP literal — let the caller decide; here we block.
  return true
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  return false
}

/**
 * Validates a URL for SSRF safety. Performs:
 *  1. Protocol check (only http/https).
 *  2. Hostname blocklist (localhost, *.local, cloud metadata, etc.).
 *  3. If the hostname is an IP literal, checks it directly.
 *  4. Otherwise resolves the hostname via DNS and checks every resolved IP
 *     (DNS-rebinding defense).
 *
 * Async because of DNS resolution.
 */
export async function validateUrl(rawUrl: string): Promise<UrlValidationResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `Blocked protocol: ${parsed.protocol}` }
  }

  // URL.hostname keeps brackets around IPv6 literals; strip them so net.isIP
  // and DNS handling see a bare address.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname) {
    return { ok: false, reason: 'Missing hostname' }
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: `Blocked hostname: ${hostname}`, hostname }
  }

  // If the hostname is itself an IP literal, validate it directly.
  const ipKind = net.isIP(hostname)
  if (ipKind !== 0) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: `Blocked IP address: ${hostname}`, hostname }
    }
    return { ok: true, hostname }
  }

  // Resolve the hostname and validate every returned address (DNS rebinding).
  let addresses: { address: string; family: number }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    return { ok: false, reason: `DNS resolution failed for ${hostname}`, hostname }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: `No DNS records for ${hostname}`, hostname }
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      return {
        ok: false,
        reason: `Hostname ${hostname} resolves to blocked IP ${address}`,
        hostname,
      }
    }
  }

  return { ok: true, hostname }
}

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'BlockedUrlError'
  }
}

/** Maximum number of redirects to follow during a guarded fetch. */
export const MAX_REDIRECT_DEPTH = 5

/**
 * Performs a `fetch` with SSRF protection and manual redirect handling. Every
 * URL in the redirect chain (including the initial one) is validated with
 * `validateUrl` before any network connection is made. Redirects are followed
 * manually up to `MAX_REDIRECT_DEPTH`.
 *
 * Throws `BlockedUrlError` if any URL in the chain is unsafe.
 */
export async function safeFetch(
  initialUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = initialUrl

  for (let depth = 0; depth <= MAX_REDIRECT_DEPTH; depth++) {
    const validation = await validateUrl(currentUrl)
    if (!validation.ok) {
      throw new BlockedUrlError(validation.reason ?? 'Blocked URL')
    }

    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })

    // 3xx with a Location header => manual redirect.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        // No location to follow; return the response as-is.
        return response
      }
      if (depth === MAX_REDIRECT_DEPTH) {
        throw new BlockedUrlError(`Too many redirects (>${MAX_REDIRECT_DEPTH})`)
      }
      // Resolve relative redirects against the current URL.
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    return response
  }

  // Unreachable, but satisfies the type checker.
  throw new BlockedUrlError(`Too many redirects (>${MAX_REDIRECT_DEPTH})`)
}
