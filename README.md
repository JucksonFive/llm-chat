# LLM Chat

Multi-provider AI chat desktop application built with React, Express, and Electron.

## Features

- **Multi-provider support** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Ollama (local)
- **Agent management** — Create multiple agents with different providers, models, and system prompts
- **Live model switching** — Change model on the fly from the header without opening settings
- **Built-in tools** — Web search, web fetch, code executor, file reader/writer, calculator, PDF reader, date & time, image generator, and deep research
- **MCP tool integration** — Connect Model Context Protocol servers to give agents access to external tools, with curated presets for popular MCP servers
- **Streaming responses** — Real-time token streaming with SSE
- **Agent memory** — Persistent memory per agent for context across conversations
- **Projects** — Organise conversations into projects to keep work focused
- **Dark/light theme** — Toggle between themes
- **Data export/import** — Backup and restore all agents, conversations, and settings
- **Electron desktop app** — Runs as a native desktop application or in the browser

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS, Radix UI / shadcn, Zustand

**Backend:** Express 5, Vercel AI SDK, MCP SDK, SQLite (better-sqlite3)

**Desktop:** Electron, esbuild

**Web Search:** SearXNG (self-hosted, via Docker)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker (required for the SearXNG web search service)

### Install

```bash
pnpm install
```

### Development (browser)

```bash
pnpm dev
```

Opens at http://localhost:5173. The Express API server runs on port 3001. Docker is started automatically and runs SearXNG on port 8888.

### Development (Electron)

```bash
pnpm dev:electron
```

Launches the app as a native desktop window with Vite HMR.

### Build for distribution

```bash
pnpm dist
```

Packages the app for your platform (zip on Linux, dmg/zip on macOS, nsis/portable on Windows).

## Project Structure

```
src/                    # React frontend
  components/           # UI components (chat, agents, settings, layout, projects, memory, MCP)
  hooks/                # Custom hooks (chat streaming, auto-scroll)
  stores/               # Zustand stores (agents, chat, MCP, memory, projects, UI)
  lib/                  # LLM client, providers config, agent templates, utilities
  types/                # TypeScript type definitions
server/                 # Express backend
  index.ts              # API endpoints (/api/chat SSE, /api/mcp/*)
  db.ts                 # SQLite database initialisation
  db-routes.ts          # REST routes for agents, conversations, memory, projects
  mcp-manager.ts        # MCP server connection lifecycle
  mcp-presets.ts        # Curated list of ready-to-use MCP server presets
  tool-bridge.ts        # Converts MCP tools to AI SDK format
  crypto.ts             # Encryption helpers
  tools/                # Built-in tool implementations
    web-search.ts       # SearXNG-backed web search
    web-fetch.ts        # Fetch content from a URL
    code-executor.ts    # Execute JavaScript, Python, or shell code
    file-reader.ts      # Read files from the local filesystem
    file-writer.ts      # Write or create files on the filesystem
    calculator.ts       # Evaluate mathematical expressions
    pdf-reader.ts       # Extract text from PDF files
    datetime.ts         # Current time, timezone conversion, date arithmetic
    image-generator.ts  # Generate images with OpenAI DALL-E / gpt-image-1
    deep-research.ts    # Multi-step web research with source compilation
electron/               # Electron main process
  main.ts               # Window creation, Express embedding
  preload.ts            # Context bridge
scripts/                # Build scripts
```

## Built-in Tools

These tools can be enabled per agent in the agent settings and require no external service (except where noted):

| Tool | Description |
|------|-------------|
| Web Search | Search the web using the local SearXNG instance (requires Docker) |
| Fetch URL | Fetch and read content from any URL |
| Code Executor | Execute JavaScript, Python, or shell code |
| File Reader | Read files from the local filesystem |
| File Writer | Write or create files on the filesystem |
| Calculator | Evaluate mathematical expressions |
| PDF Reader | Extract text from PDF files |
| Date & Time | Get current time, convert timezones, calculate date differences |
| Image Generator | Generate images with OpenAI DALL-E / gpt-image-1 (requires OpenAI API key) |
| Deep Research | Multi-step web research with source compilation |

## MCP Presets

One-click setup for popular Model Context Protocol servers:

| Preset | Category | Description |
|--------|----------|-------------|
| Filesystem | Filesystem | Read, write, and manage local files |
| Brave Search | Search | Web search via Brave Search API |
| GitHub | Developer | Manage repos, issues, and pull requests |
| Memory | Productivity | Persistent knowledge graph memory |
| SQLite | Database | Query and manage SQLite databases |
| Puppeteer | Developer | Browser automation and web scraping |
| Everything (Demo) | Developer | Demo server showcasing all MCP features |

## Supported Models

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3-mini |
| Anthropic | claude-sonnet-4, claude-haiku-4.5, claude-opus-4 |
| Google | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| Ollama | Any local model (llama3.1, mistral, codellama, etc.) |

## API Keys

API keys are stored locally in your browser (localStorage) and are never sent to or stored on the server.

## License

Private
