# M5 — Add Security Warnings for MCP Presets

**Severity:** Medium  
**CVSS:** 5.0 (AV:L/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:L)  
**Status:** Open  
**Files:** `server/mcp-presets.ts`, `src/components/settings/mcp-presets-dialog.tsx`  

## Problem

MCP presets can include `stdio` transport servers that run arbitrary commands (e.g., `npx`, `uvx`, `python`). Users can add these with one click, potentially running untrusted code from the npm/PyPI registry.

There's no security warning in the UI about the risks of installing third-party MCP servers.

## Acceptance criteria

- [ ] When adding a preset with `transport: 'stdio'`, show a warning modal:
  - _"This MCP server runs a command on your system. It will have access to your files, network, and environment. Only install servers from trusted sources."_
  - Display the exact command that will be executed (e.g., `npx -y @anthropic/mcp-server-filesystem`)
  - Require explicit confirmation before adding
- [ ] For `sse` and `streamable-http` transports, show a milder warning:
  - _"This MCP server connects to a remote URL. It will have network access. Ensure you trust the server operator."_
- [ ] Add a "Report this preset" or "View source" link for each preset (if the preset metadata includes a URL)
- [ ] The preset metadata in `mcp-presets.ts` should include a `homepage` or `sourceUrl` field
- [ ] Tests: verify the warning modal renders for stdio presets

## Implementation notes

- The warning dialog should be in `mcp-presets-dialog.tsx` since that's where users select presets
- Use the existing `Dialog` component for the confirmation modal
- The preset data model in `server/mcp-presets.ts` may need a new optional field: `warning?: string`
