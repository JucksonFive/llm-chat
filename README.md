# LLM Chat

A powerful multi-provider AI chat desktop application with advanced features like deep research, MCP tool integration, semantic memory, and custom agent workflows. Built with React, Express, and Electron.

![Main Interface](./docs/images/main-interface.png)
*Main chat interface with streaming responses and tool integration*

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [MCP Integration](#mcp-integration)
- [Built-in Tools](#built-in-tools)
- [Supported Models](#supported-models)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Project Structure](#project-structure)
- [Architecture Notes](#architecture-notes)
- [Testing](#testing)

## Features

### 🤖 Multi-Provider AI Support
- **Six major providers** — OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, AWS Bedrock, Ollama (local)
- **Agent management** — Create unlimited agents with different providers, models, and system prompts
- **Live model switching** — Change models on the fly from the header without opening settings
- **Capability detection** — Automatic badges for ✨ Reasoning, 🖼️ Vision, and 📚 Large context windows
- **Streaming responses** — Real-time token streaming with Server-Sent Events

![Agent Configuration](./docs/images/agent-config.png)
*Configure agents with different providers, models, and custom system prompts*

### 🔬 Advanced AI Capabilities
- **Deep research workflow** — Multi-step web research powered by LangGraph state machine
  - Live progress panel showing: planning → searching → fetching → analyzing → synthesizing → reporting
  - Source discovery with URL tracking and elapsed time
  - Frosted-glass progress panel that slides up from bottom
- **Reasoning transparency** — Differentiated "Thinking..." vs "Generating..." indicators
  - Collapsible thought-process blocks with word counts
  - Auto-expand during streaming (amber tint), auto-collapse when complete
  - Preview snippets for collapsed reasoning blocks
- **Tool integration** — Built-in tools and external MCP servers
  - Elapsed-time tracking for all tool calls
  - Progress bars for long-running operations (>5s)
  - Visual feedback with status badges (calling/complete/error)
- **Token streaming feedback** — Live approximate token counter during generation

![Deep Research](./docs/images/deep-research.png)
*Deep research workflow with live progress tracking*

![Reasoning Blocks](./docs/images/reasoning-blocks.png)
*Transparent reasoning with collapsible thought processes*

### 🧠 Memory & Context Management
- **Persistent agent memory** — Short-term and long-term memory per agent
- **Semantic memory search** — OpenAI text-embedding-3-small with cosine similarity retrieval
  - Lazy embedding strategy (embedded on first search, not on creation)
  - Pure-JS vector search over sql.js (no native dependencies)
  - Linear scan fast enough for 100s-1000s of vectors per agent
- **Memory usage tracking**
  - Header badge shows active memory count
  - Message badges show memories used per response
  - Recently-used memories highlighted in panel
  - `lastUsedAt` tracking for memory relevance

![Memory Panel](./docs/images/memory-panel.png)
*Semantic memory with usage tracking and highlights*

### 🔌 MCP (Model Context Protocol) Integration
- **Native MCP support** — Connect external tools and data sources
- **Import/export functionality** — File upload, URL fetch, or paste JSON
  - Validates server configurations before import
  - Preview with connection status for each server
  - Batch import multiple servers at once
- **NPX installation** — One-click install MCP servers via npx
  - Parses npx commands and derives server names
  - Auto-populates command and arguments
  - Builds connection summaries for quick validation
- **Pre-configured presets** — Popular MCP servers ready to use
  - Filesystem, Brave Search, GitHub, Memory, SQLite, Puppeteer, Everything
  - One-click setup with sensible defaults
- **Resource panels** — Browse prompts, resources, and tools from connected servers
- **Tool bridge** — Converts MCP tools to Vercel AI SDK format automatically

![MCP Import](./docs/images/mcp-import.png)
*Import MCP servers from file, URL, or npx command*

![MCP Presets](./docs/images/mcp-presets.png)
*One-click setup for popular MCP servers*

### 🔍 Search & Organization
- **Global message search** — `Cmd+K` / `Ctrl+K` opens fuzzy search across all conversations
  - Content highlighting in results
  - Debounced 300ms for performance
  - Scroll-to-message with highlight animation
- **Smart filters** — Filter by attachments, tool usage, or date range
  - "Today", "This week" quick filters
  - Attachment type filtering
  - Tool usage filtering
- **Sidebar conversation search** — Instant filter by title or content (in-memory)
- **Projects** — Organize conversations into logical groupings

![Global Search](./docs/images/global-search.png)
*Global message search with content highlighting*

### 🎨 User Experience
- **Error recovery** — Clear error banners with one-click "Try again" retry
  - Resends last user message automatically
  - Preserves conversation context
- **Rich onboarding** — Empty state showcasing features
  - Voice input/output, attachments, search, memory, tools
  - Quick start guide
- **Keyboard shortcuts** — Press `?` to see all shortcuts
- **Mobile responsive** — Touch-friendly controls
  - 48px tap targets
  - Tabbed settings
  - Stacked input layout on small screens
- **Polished animations** — Framer Motion transitions
  - Smooth message appearance
  - Dialog and panel animations
  - Skeleton loaders for agents and conversations
- **Dark/light theme** — Seamless theme switching
- **Voice I/O** — Speech recognition for input, text-to-speech for replies

![Keyboard Shortcuts](./docs/images/shortcuts.png)
*Comprehensive keyboard shortcuts dialog*

### ⚡ Performance Optimizations
- **Memoized rendering** — React.memo on MessageBubble with custom comparator
  - Only re-renders on content/reasoning/streaming/tools/error changes
  - Prevents cascade re-renders during streaming
- **Message pagination** — Render last 50 messages by default
  - "Load earlier messages" button for older content
  - Keeps initial render fast for long conversations
- **Optimized stores** — Zustand with shallow comparisons
  - Minimal re-renders across components
  - Efficient state updates during streaming

### 🔐 Security & Infrastructure
- **Database encryption** — Optional AES-256-GCM encryption at rest
  - Scrypt key derivation (cached per process)
  - Stable salt to avoid repeated 100ms derivation on auto-save
- **Client-side API keys** — Keys stored only in browser localStorage
  - Never persisted server-side
  - Passed per-request in body
- **Data portability** — Export/import all data
  - Agents, conversations, settings, memories
  - JSON format for easy backup
- **Electron desktop** — Native app or browser-based
- **Production ready** — Docker + Caddy with automatic HTTPS
  - Self-hosted deployment
  - Environment-based configuration

## Tech Stack

### Frontend
- **React 19** — Latest React with concurrent features
- **TypeScript** — Full type safety across the codebase
- **Vite** — Lightning-fast HMR and builds
- **TailwindCSS 4** — Utility-first styling with CSS variables
- **Radix UI / shadcn** — Accessible component primitives
- **Zustand** — Lightweight state management
- **Framer Motion (motion/react)** — Smooth animations and transitions

### Backend
- **Express 5** — Modern Node.js server framework
- **Vercel AI SDK** — Unified streaming interface for all LLM providers
- **MCP SDK** — Model Context Protocol server integration
- **LangChain** — Text embeddings for semantic search
- **sql.js** — In-memory SQLite with auto-persistence
- **LangGraph** — State machine for deep research workflow

### Desktop
- **Electron** — Native desktop application wrapper
- **esbuild** — Fast bundling for main and preload scripts

### Infrastructure
- **Docker** — Containerized deployment
- **Caddy** — Automatic HTTPS with Let's Encrypt
- **SearXNG** — Self-hosted privacy-respecting search engine

## Getting Started

### Prerequisites

- **Node.js 18+** — JavaScript runtime
- **pnpm** — Fast, disk space efficient package manager
- **Docker** (optional) — Required for SearXNG web search and production deployment

### Quick Start

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd llm-chat
   pnpm install
   ```

2. **Start development server**
   ```bash
   pnpm dev
   ```
   - Opens at http://localhost:5173
   - Express API server runs on port 3001
   - Docker Compose automatically starts SearXNG for web search

3. **Add your API keys**
   - Open the app in your browser
   - Go to Settings → click on an agent
   - Add API keys for your preferred providers (OpenAI, Anthropic, etc.)
   - Keys are stored locally in browser localStorage only
   
   **For AWS Bedrock**: Configure AWS credentials via AWS CLI or environment variables. See [Bedrock Setup Guide](./docs/bedrock-setup.md) for details.

### Development Modes

#### Browser Mode (Recommended for development)
```bash
pnpm dev
```
- Full HMR (Hot Module Replacement)
- DevTools in browser
- Faster iteration cycle

#### Electron Mode
```bash
pnpm dev:electron
```
- Native desktop window
- Tests desktop-specific features
- Still has Vite HMR

### Environment Variables

Create a `.env` file in the project root (optional):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_CHAT_MASTER_PASSWORD` | No | - | Enables AES-256-GCM encryption of `~/.llm-chat/data.db`. Use for database encryption at rest. |
| `PORT` | No | 3001 | Express server port |
| `VITE_API_URL` | No | http://localhost:3001 | Backend API URL for frontend |
| `AWS_REGION` | No | us-east-1 | AWS region for Bedrock |
| `AWS_PROFILE` | No | default | AWS profile for Bedrock credentials |

### Building for Distribution

#### Package for your platform
```bash
pnpm dist
```
Outputs:
- **Linux**: `.zip` archive
- **macOS**: `.dmg` installer + `.zip` archive
- **Windows**: `.exe` NSIS installer + portable `.exe`

Built apps are in the `dist/` directory.

#### Build without packaging
```bash
pnpm build          # Build frontend
pnpm build:electron # Build electron main/preload
```

### Production Deployment (Docker)

1. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   DOMAIN=your-domain.com
   LLM_CHAT_MASTER_PASSWORD=your-secure-password  # Optional
   ```

2. **Start services**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. **Access the app**
   - Caddy automatically provisions Let's Encrypt TLS certificates
   - Access at `https://your-domain.com`

Services:
- **llm-chat** — Main application (port 3001 internally)
- **caddy** — Reverse proxy with automatic HTTPS
- **searxng** — Self-hosted search engine

#### Update deployment
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### First-Time Setup

1. **Create your first agent**
   - Click "New Agent" in the sidebar
   - Select a provider (e.g., OpenAI)
   - Choose a model (e.g., gpt-4o)
   - Add your API key
   - Optionally customize the system prompt

2. **Start a conversation**
   - Select the agent from the sidebar
   - Type a message in the input box
   - Press Enter to send

3. **Explore features**
   - Press `?` to see keyboard shortcuts
   - Try voice input with the microphone button
   - Drag and drop images or PDFs
   - Enable tools in agent settings for enhanced capabilities

## MCP Integration

Model Context Protocol (MCP) allows agents to connect to external tools and data sources. LLM Chat provides multiple ways to add MCP servers.

### Import MCP Servers

![MCP Import Tabs](./docs/images/mcp-import-tabs.png)
*Three ways to import MCP servers: file upload, URL fetch, or npx command*

#### From File
1. Go to Settings → MCP Servers
2. Click "Import" → "From File" tab
3. Upload a JSON configuration file
4. Review connection status in preview
5. Click "Import N Server(s)"

#### From URL
1. Click "From URL" tab
2. Paste a URL to a JSON configuration
3. Click "Fetch Config"
4. Preview and import

#### Via NPX
1. Click "Install via npx" tab
2. Paste an npx command (e.g., `npx -y @modelcontextprotocol/server-brave-search`)
3. The command is automatically parsed
4. Server name and connection details are derived
5. Add any required environment variables
6. Click "Install Server"

### MCP Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Using MCP Presets

Pre-configured servers for common use cases:

| Preset | Setup Required | Description |
|--------|---------------|-------------|
| **Filesystem** | None | Read, write, and manage files on your local system |
| **Brave Search** | API Key | Web search via Brave Search API |
| **GitHub** | Personal Token | Manage repos, issues, and pull requests |
| **Memory** | None | Persistent knowledge graph across conversations |
| **SQLite** | Database Path | Query and manage SQLite databases |
| **Puppeteer** | None | Browser automation and web scraping |
| **Everything** | None | Demo server showcasing all MCP capabilities |

To use a preset:
1. Go to Settings → MCP Servers
2. Click "Add from Preset"
3. Select a preset
4. Fill in required configuration (API keys, paths)
5. Click "Add Server"

### Troubleshooting MCP

If a server shows "disconnected":
- Check that the command/binary exists
- Verify environment variables are set correctly
- Check server logs in the MCP panel
- Ensure npm packages are installed globally or via npx

For more details, see [MCP-IMPORT-GUIDE.md](./MCP-IMPORT-GUIDE.md).

## Keyboard Shortcuts

Press `?` anywhere in the app to see the shortcuts dialog.

### Global

| Shortcut | Action |
|----------|--------|
| `?` | Show/hide keyboard shortcuts dialog |
| `Ctrl+K` / `⌘K` | Open global message search |
| `Esc` | Close active dialog, panel, or search |

### Chat Input

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | Insert new line in message |
| `Ctrl+V` / `⌘V` | Paste images or files from clipboard |
| Drag & Drop | Attach files (images, PDFs, documents) |

### Navigation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate search results (when search is open) |
| `Enter` | Jump to selected message from search results |
| Click message | Scroll to message in conversation |

### Productivity Tips

- Use `Cmd+K` to quickly find past conversations across all agents
- Drag multiple images at once for batch attachment
- Hold `Shift` while pressing `Enter` to add line breaks in messages
- Press `Esc` repeatedly to close nested dialogs (search → settings → etc.)

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

Enable these tools per agent in the agent settings. Most require no external services.

### Search & Web
| Tool | Requirements | Description |
|------|-------------|-------------|
| **Web Search** | Docker (SearXNG) | Search the web using local SearXNG instance |
| **Fetch URL** | None | Fetch and read content from any URL |

### Code & Files
| Tool | Requirements | Description |
|------|-------------|-------------|
| **Code Executor** | None | Execute JavaScript, Python, or shell code in sandbox |
| **File Reader** | None | Read files from the local filesystem |
| **File Writer** | None | Write or create files on the filesystem |
| **PDF Reader** | None | Extract text content from PDF files |

### Utilities
| Tool | Requirements | Description |
|------|-------------|-------------|
| **Calculator** | None | Evaluate mathematical expressions |
| **Date & Time** | None | Get current time, convert timezones, calculate date differences |

### AI & Advanced
| Tool | Requirements | Description |
|------|-------------|-------------|
| **Image Generator** | OpenAI API Key | Generate images with DALL-E / gpt-image-1 |
| **Deep Research** | Web Search tool | Multi-step web research with LangGraph state machine, source compilation, and live progress UI |
| **Index Document** | OpenAI API Key | Index documents (PDFs, text) for RAG retrieval with embeddings |
| **Search Document** | OpenAI API Key | Search across indexed documents using cosine similarity |

### Enabling Tools

1. Go to Settings → select an agent
2. Scroll to "Tools" section
3. Toggle the tools you want to enable
4. Some tools require additional configuration (API keys, Docker services)
5. Tools appear in the agent's context and can be called automatically

![Tool Call Block](./docs/images/tool-call-block.png)
*Tool execution with status, parameters, and results*

## Supported Models

### Provider Overview

| Provider | API Required | Models Available | Special Features |
|----------|-------------|------------------|------------------|
| **OpenAI** | Yes | gpt-4o, gpt-4o-mini, o1, o3-mini | Reasoning models, DALL-E |
| **Anthropic** | Yes | claude-sonnet-4, claude-opus-4, claude-haiku-4.5 | Long context, artifacts |
| **Google** | Yes | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | Massive context (2M tokens) |
| **DeepSeek** | Yes | deepseek-v4-pro, deepseek-v4-flash, deepseek-r1 | Cost-effective, reasoning |
| **AWS Bedrock** | AWS Credentials | Claude 3.5, Amazon Nova models | Enterprise, AWS integration |
| **Ollama** | No (local) | Any Ollama model | Privacy, no API costs |

### Capability Badges

Models automatically receive capability badges based on their features:

#### ✨ Reasoning Models
Models with extended thinking/reasoning capabilities:
- OpenAI: `o1`, `o1-mini`, `o3-mini`
- DeepSeek: `deepseek-r1`
- Claude: Models with "thinking" in the name

Features:
- Transparent reasoning blocks
- "Thinking..." indicator before generation
- Collapsible thought processes with word counts

#### 🖼️ Vision Models
Models that can analyze images:
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Claude: `claude-3+` series (sonnet, opus, haiku)
- Google: All `gemini` models
- Ollama: `llava`, `pixtral`, `bakllava`

Features:
- Image attachment support
- Drag-and-drop images
- Paste images from clipboard
- Multi-image conversations

#### 📚 Large Context Models
Models with extended context windows:
- **128K tokens**: OpenAI `gpt-4o`
- **200K tokens**: Claude 3+ series
- **1M-2M tokens**: Google Gemini

Features:
- Long document analysis
- Extended conversations
- Large codebase context

### Model Selection Tips

- **General chat**: `gpt-4o-mini`, `claude-haiku-4.5`, `gemini-2.5-flash` (fast + affordable)
- **Complex reasoning**: `o1`, `claude-opus-4`, `deepseek-r1` (best quality)
- **Vision tasks**: `gpt-4o`, `claude-sonnet-4`, `gemini-2.5-pro`
- **Long documents**: `gemini-2.5-pro` (2M context), `claude-opus-4` (200K context)
- **Privacy/offline**: Ollama with any local model
- **Cost-effective**: `deepseek-v4-flash`, `gpt-4o-mini`, `gemini-2.5-flash`

### Adding Custom Models

For Ollama or custom providers:
1. Go to Settings → Agent
2. Select "Ollama" or "Custom" provider
3. Enter the model name
4. Configure the endpoint if needed
5. Test the connection

## Screenshots

### Dashboard & Chat Interface
![Dashboard Empty State](./docs/images/dashboard-empty.png)
*Clean dashboard with feature highlights and quick start guide*

![Chat Streaming](./docs/images/chat-streaming.png)
*Real-time streaming responses with token counter*

### Agent Management
![Agent List](./docs/images/agent-list.png)
*Manage multiple agents with different providers and models*

![Agent Configuration](./docs/images/agent-settings.png)
*Detailed agent configuration with system prompts and tools*

### Tools & Integration
![Tool Execution](./docs/images/tool-execution.png)
*Tool calls with parameters, results, and elapsed time tracking*

![MCP Servers](./docs/images/mcp-servers.png)
*Connected MCP servers with status monitoring*

### Memory & Search
![Memory Panel](./docs/images/memory-usage.png)
*Semantic memory panel with recent usage highlights*

![Message Search](./docs/images/message-search.png)
*Global search across all conversations with highlighting*

### Research Workflow
![Research Progress](./docs/images/research-stages.png)
*Deep research workflow with stage-by-stage progress tracking*

![Research Sources](./docs/images/research-sources.png)
*Source discovery and URL tracking during research*

### Settings & Customization
![Settings Tabs](./docs/images/settings-tabs.png)
*Organized settings with Appearance, Data, MCP, and Documentation tabs*

![Theme Switcher](./docs/images/theme-toggle.png)
*Dark and light theme support with smooth transitions*

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
