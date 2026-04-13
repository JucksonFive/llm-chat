# LLM Chat

Multi-provider AI chat desktop application built with React, Express, and Electron.

## Features

- **Multi-provider support** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Ollama (local)
- **Agent management** — Create multiple agents with different providers, models, and system prompts
- **Live model switching** — Change model on the fly from the header without opening settings
- **MCP tool integration** — Connect Model Context Protocol servers to give agents access to external tools
- **Streaming responses** — Real-time token streaming with SSE
- **Agent memory** — Persistent memory per agent for context across conversations
- **Dark/light theme** — Toggle between themes
- **Data export/import** — Backup and restore all agents, conversations, and settings
- **Electron desktop app** — Runs as a native desktop application or in the browser

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS, Radix UI / shadcn, Zustand

**Backend:** Express 5, Vercel AI SDK, MCP SDK

**Desktop:** Electron, esbuild

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
pnpm install
```

### Development (browser)

```bash
pnpm dev
```

Opens at http://localhost:5173. The Express API server runs on port 3001.

### Development (Electron)

```bash
pnpm dev:electron
```

Launches the app as a native desktop window with Vite HMR.

### Build for distribution

```bash
pnpm dist
```

Packages the app for your platform (AppImage/zip on Linux, dmg/zip on macOS, nsis/portable on Windows).

## Project Structure

```
src/                  # React frontend
  components/         # UI components (chat, agents, settings, layout)
  hooks/              # Custom hooks (chat streaming, auto-scroll)
  stores/             # Zustand stores (agents, chat, MCP, memory, UI)
  lib/                # LLM client, providers config, utilities
  types/              # TypeScript type definitions
server/               # Express backend
  index.ts            # API endpoints (/api/chat SSE, /api/mcp/test)
  mcp-manager.ts      # MCP server connection lifecycle
  tool-bridge.ts      # Converts MCP tools to AI SDK format
electron/             # Electron main process
  main.ts             # Window creation, Express embedding
  preload.ts          # Context bridge
scripts/              # Build scripts
```

## Supported Models

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3-mini |
| Anthropic | claude-sonnet-4, claude-haiku-4.5, claude-opus-4 |
| Google | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Ollama | Any local model (llama3.1, mistral, codellama, etc.) |

## License

Private
