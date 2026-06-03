# LLM Chat

Multi-provider AI chat desktop application built with React, Express, and Electron.

## Features

### Core
- **Multi-provider support** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Ollama (local)
- **Agent management** — Create multiple agents with different providers, models, and system prompts
- **Live model switching** — Change model on the fly from the header without opening settings
- **Model capability detection** — Automatic badges for ✨ Reasoning, 🖼️ Vision, and 📚 Large context windows
- **Streaming responses** — Real-time token streaming with SSE
- **Voice input/output** — Speech recognition for input, text-to-speech for replies
- **Projects** — Organize conversations into projects
- **Dark/light theme** — Toggle between themes

### AI Capabilities
- **Deep research workflow** — Multi-step web research with live progress panel showing planning → searching → fetching → analyzing → synthesizing → reporting stages, source discovery, and elapsed time tracking
- **Reasoning transparency** — Differentiated "Thinking..." vs "Generating..." indicators, collapsible thought-process blocks with word counts and previews
- **Tool integration** — Built-in tools and external MCP servers with elapsed-time tracking and progress bars for long-running operations
- **Token streaming feedback** — Live approximate token counter during generation

### Memory & Context
- **Persistent agent memory** — Short-term and long-term memory per agent
- **Semantic memory search** — Memories embedded with OpenAI text-embedding-3-small and retrieved by cosine similarity
- **Memory usage indicators** — Header badge shows active memories, message badges show how many memories were used in each response, recently-used memories highlighted in panel

### Search & Organization
- **Global message search** — Cmd+K opens fuzzy search across all conversations with content highlighting
- **Smart filters** — Filter by attachments, tool usage, or date range (today/this week)
- **Sidebar conversation search** — Quick filter conversations by title or content
- **Scroll-to-message** — Click search result to jump directly to the message with highlight animation

### User Experience
- **Error recovery** — Clear error banners with one-click "Try again" retry button that resends the last user message
- **Onboarding** — Rich empty state showcasing features (voice, attachments, search, memory, tools)
- **Keyboard shortcuts** — Press `?` anywhere to see all shortcuts (Ctrl+K, Enter, Shift+Enter, Esc, etc.)
- **Mobile responsive** — Touch-friendly controls (48px targets), tabbed settings, stacked input layout on small screens
- **Skeleton loaders** — Smooth loading states for agents and conversations
- **Polished animations** — Framer Motion transitions for messages, dialogs, panels, and tabs

### Performance
- **Memoized rendering** — React.memo on message bubbles prevents unnecessary re-renders during streaming
- **Message pagination** — Long conversations show only the last 50 messages by default with "Load earlier" button
- **Optimized stores** — Zustand with shallow comparisons for minimal re-renders

### Infrastructure
- **MCP tool integration** — Connect Model Context Protocol servers to give agents access to external tools
- **Built-in tools** — Web search, code executor, file reader/writer, PDF reader, calculator, image generation, deep research
- **Database encryption** — Optional AES-256-GCM encryption of the SQLite database at rest
- **Client-side API key storage** — Keys stay in the browser's localStorage, never persisted on the server
- **Data export/import** — Backup and restore all agents, conversations, and settings
- **Electron desktop app** — Runs as a native desktop application or in the browser
- **Production deployment** — Docker + Caddy with automatic HTTPS

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS 4, Radix UI / shadcn, Zustand, Framer Motion (motion/react)

**Backend:** Express 5, Vercel AI SDK, MCP SDK, LangChain (embeddings), sql.js, LangGraph (deep-research state machine)

**Desktop:** Electron, esbuild

**Infrastructure:** Docker, Caddy, SearXNG (self-hosted search)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for SearXNG web search)

### Install

```bash
pnpm install
```

### Development (browser)

```bash
pnpm dev
```

Opens at http://localhost:5173. The Express API server runs on port 3001. Docker Compose starts SearXNG for web search.

### Development (Electron)

```bash
pnpm dev:electron
```

Launches the app as a native desktop window with Vite HMR.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_CHAT_MASTER_PASSWORD` | No | Enables AES-256-GCM encryption of `~/.llm-chat/data.db` |

### Build for distribution

```bash
pnpm dist
```

Packages the app for your platform (zip on Linux, dmg/zip on macOS, nsis/portable on Windows).

### Production (Docker)

```bash
cp .env.example .env   # Set DOMAIN and optionally LLM_CHAT_MASTER_PASSWORD
docker compose -f docker-compose.prod.yml up -d
```

Caddy handles TLS certificates automatically.

## Testing

```bash
pnpm test          # Run all tests (vitest) — 340+ tests
pnpm test:watch    # Watch mode
pnpm lint          # ESLint
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `⌘K` | Open global message search |
| `?` | Show keyboard shortcuts dialog |
| `Esc` | Close active dialog or panel |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| Drag & drop | Attach files (images, PDFs) |
| `Ctrl+V` | Paste files from clipboard |

## Project Structure

```
src/                            # React frontend
  components/
    chat/
      message-bubble.tsx        # Memoized message renderer with reasoning blocks
      message-input.tsx         # Input with voice, attachments, drag-drop
      chat-window.tsx           # Paginated message list
      tool-call-block.tsx       # Tool execution UI with elapsed time
      research-progress-panel.tsx  # Deep-research stage tracker
      message-search-dialog.tsx # Global Cmd+K search
      keyboard-shortcuts-dialog.tsx  # ? shortcut guide
      error-retry-button.tsx    # Retry failed messages
      empty-state.tsx           # Rich onboarding view
    agents/
      agent-dialog.tsx          # Agent CRUD form
      model-capability-badges.tsx  # Reasoning/Vision/Context badges
    layout/                     # Header, sidebar, chat layout
    settings/                   # Tabbed settings sheet (Appearance/Data/MCP/Docs)
    memory/                     # Memory panel with usage highlights
    mcp/                        # MCP server config & resource panels
    projects/                   # Project CRUD
    ui/                         # shadcn/ui primitives
  hooks/
    use-chat-stream.ts          # SSE streaming with research/memory tracking
    use-message-search.ts       # Debounced global & sidebar search
    use-auto-scroll.ts          # Smart scroll-to-bottom
    use-mobile.ts               # Responsive breakpoint hook
  stores/                       # Zustand stores
    agent-store.ts              # Agent CRUD
    chat-store.ts               # Conversations & messages
    research-store.ts           # Deep-research progress
    memory-store.ts             # Memories with last-used tracking
    mcp-store.ts                # MCP server connections
    api-key-store.ts            # Client-side API keys
    project-store.ts            # Projects
    document-store.ts           # Indexed RAG documents
    ui-store.ts                 # Theme, auto-speak
  lib/
    llm-client.ts               # Unified streaming client across providers
    providers.ts                # Provider definitions
    model-capabilities.ts       # Detect reasoning/vision/context from model name
    agent-templates.ts          # Pre-built agent presets
    default-system-prompt.ts    # Default & preset system prompts
    utils.ts                    # cn() classname helper
  types/                        # TypeScript definitions

server/                         # Express backend
  index.ts                      # API endpoints (/api/chat SSE, /api/mcp/*, /api/db/*, /api/rag/*)
  db.ts                         # sql.js database (auto-save, migrations)
  db-encryption.ts              # AES-256-GCM encryption layer
  db-routes.ts                  # CRUD REST API for agents, conversations, memories
  mcp-manager.ts                # MCP server connection lifecycle
  mcp-presets.ts                # Pre-configured MCP server templates
  tool-bridge.ts                # Converts MCP tools to AI SDK format
  crypto.ts                     # Legacy per-field encryption (deprecated, migration only)
  rag/                          # Retrieval-augmented generation
    embeddings.ts               # OpenAI text-embedding-3-small client (batched, cached)
    vector-store.ts             # Pure-JS cosine-similarity vector search over sql.js
    memory-index.ts             # Lazy embedding indexer for agent memories
    routes.ts                   # POST /api/rag/memories/search
  tools/                        # Built-in agent tools
    web-search.ts               # SearXNG integration
    web-fetch.ts                # URL content fetcher
    code-executor.ts            # Sandboxed JS/Python/shell execution
    file-reader.ts              # Local file reader
    file-writer.ts              # Local file writer
    pdf-reader.ts               # PDF text extraction
    calculator.ts               # Math expression evaluator
    image-generator.ts          # DALL-E / gpt-image-1
    deep-research/              # LangGraph state machine for multi-step research
      graph.ts                  # State machine definition
      state.ts                  # Research state types
      nodes/                    # Planning, search, fetch, analysis, synthesis nodes
    datetime.ts                 # Time/timezone utilities

electron/                       # Electron main process
  main.ts                       # Window creation, Express embedding
  preload.ts                    # Context bridge

scripts/                        # Build scripts
plans/                          # Implementation plans
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
| Deep Research | Multi-step web research with LangGraph state machine, source compilation, and live progress UI |
| Index Document | Index documents (PDFs, text) for RAG retrieval |
| Search Document | Search across indexed documents using cosine similarity |

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
| DeepSeek | deepseek-v4-pro, deepseek-v4-flash, deepseek-r1 |
| Ollama | Any local model (llama3.1, mistral, codellama, etc.) |

Capability badges are automatically detected from model names:
- ✨ **Reasoning** — o1/o3, deepseek-r1, claude-thinking models
- 🖼️ **Vision** — gpt-4o, claude-3+, gemini, llava, pixtral
- 📚 **Large context** — 128K (gpt-4o), 200K (claude-3+), 1M-2M (gemini)

## Screenshots

### Dashboard & Chat Interface
![LLM Chat dashboard with empty conversation](image.png)

![Chat interface with streaming response](image-1.png)

### Agent Settings & Configuration
![Agent settings panel showing provider and model selection](image-2.png)

## Architecture Notes

### Streaming & Reasoning
- **Streaming** uses Server-Sent Events (SSE). The `use-chat-stream` hook parses tokens, `<think>` blocks, tool calls, and tool results, dispatching them to dedicated chat-store actions.
- **Reasoning blocks** are auto-expanded during streaming (amber tint) and auto-collapse when complete with a preview snippet and word count.
- **Thinking vs. generating** — `isGeneratingContent` flag flips when the first content token arrives, switching the indicator color from amber to blue.

### Memory & RAG
- **API keys** are stored only in the browser (`localStorage`). The server never persists them — they are passed per-request in the body of `/api/chat` and `/api/rag/memories/search`.
- **Semantic memory search** uses a lazy embedding strategy: memories are embedded on first search, not on creation. This keeps the memory CRUD free of OpenAI key requirements and degrades gracefully.
- **Vector search** is a linear cosine scan over the sql.js `vectors` table. This is fast enough for hundreds to low-thousands of vectors per agent and avoids native extension packaging complexity.
- **Memory usage tracking** — When memories are included in a system prompt, their `lastUsedAt` is updated and the message records `memoriesUsedCount` for the UI badge.

### Deep Research
- **State machine** built with LangGraph: planning → searching → fetching → analyzing → synthesizing → reporting.
- **Progress panel** in the frontend (`research-store` + `research-progress-panel.tsx`) tracks stage transitions, source discovery, and elapsed time. Slides up from the bottom with frosted-glass backdrop, minimizes to a 64px bar.

### Performance
- **MessageBubble memoization** — Custom comparator only re-renders when message content/reasoning/streaming/tools/error change, not on unrelated parent re-renders.
- **Message pagination** — Renders only the most recent 50 messages by default; older messages loaded on demand via "Load earlier messages" button.
- **Search debouncing** — Global search debounced 300ms; sidebar conversation filter is instant (in-memory).

### Security
- **Database encryption** uses scrypt key derivation (cached per process) + AES-256-GCM. The salt is stable within a process to avoid repeated 100ms key derivation on each auto-save.
- **API key isolation** — Keys never leave the browser's `localStorage` except in request bodies; they are not persisted server-side.

## License

Private
