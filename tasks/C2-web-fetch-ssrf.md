# C2 — Prevent SSRF in Web-Fetch and Web-Search

**Severity:** Critical  
**CVSS:** 7.7 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N)  
**Status:** Open  
**Files:** `server/tools/web-fetch.ts`, `server/tools/web-search.ts`  

## Problem

Both tools call `fetch(url)` without validating the target:

- **web-fetch** (`server/tools/web-fetch.ts:18`): accepts any URL the LLM provides
- **web-search** (`server/tools/web-search.ts:70`): `fetchPageContent()` fetches result URLs, which could redirect to internal hosts
- **web-search** (`server/tools/web-search.ts:106`): `searchSearXNG()` connects to SearXNG at `SEARXNG_URL` — but the fetched result URLs are unfiltered

An attacker could request:
- Internal services: `http://localhost:3001/api/db/agents`
- Cloud metadata: `http://169.254.169.254/latest/meta-data/`
- File protocol: `file:///etc/passwd`
- Internal network hosts

## Acceptance criteria

- [ ] `validateUrl()` helper blocks the following:
  - Private/reserved IPv4 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`
  - IPv6 loopback/unique-local: `::1`, `fc00::/7`, `fe80::/10`
  - Hostnames resolving to private IPs (DNS rebinding protection) — either block known hostnames (`localhost`, `*.local`, `metadata.google.internal`) or resolve-and-validate
  - Non-HTTP(S) protocols: `file://`, `ftp://`, `gopher://`, etc.
- [ ] Maximum redirect depth set to 5 (override `fetch` default `redirect: 'follow'` with manual redirect handling)
- [ ] The `SEARXNG_URL` default (`http://localhost:8888`) is not reachable via the web-fetch tool
- [ ] Tests: unit tests for `validateUrl()` with positive and negative cases; integration test verifies blocked SSRF doesn't crash the tool

## Implementation notes

- Create a shared `server/lib/url-validator.ts` used by both `web-fetch.ts` and `web-search.ts`
- Use `new URL()` for protocol checking and `dns.resolve()` (async) or a static IP-range check for the hostname
- DNS rebinding defense: resolve the hostname and check every resolved IP against the blocked ranges
- `fetch` doesn't follow redirects when `redirect: 'manual'` — switch to manual and handle `3xx` in a loop
