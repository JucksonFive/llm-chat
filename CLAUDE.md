# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server + client (browser mode, ~5173)
pnpm dev:electron     # Start dev server + client + Electron window
pnpm build            # TypeScript compilation (tsc -b) + Vite bundle
pnpm build:electron   # Bundle Electron main/preload scripts only
pnpm lint             # ESLint across the whole project
pnpm test             # Run all vitest tests (node environment by default)
pnpm test:watch       # vitest in watch mode

# Run a single test file or test by name
npx vitest run path/to/file.test.ts
npx vitest run -t "test name pattern"
```

The project uses TypeScript project references (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`). `tsc -b` builds both.

Tests live alongside source, matched by `server/**/*.test.ts` and `src/**/*.test.ts`. The environment defaults to `node`; store tests needing `localStorage` opt into jsdom per-file with `// @vitest-environment jsdom`.

## Architecture

### Stack

- **Frontend**: React 19, Vite 8, TailwindCSS 4, Radix UI / shadcn, Zustand 5, Framer Motion
- **Backend**: Express 5, Vercel AI SDK 6, MCP SDK, LangChain/LangGraph
- **Database**: sql.js (in-memory SQLite, auto-saved to `~/.llm-chat/data.db` every 5s on change)
- **Desktop**: Electron 41 with esbuild-bundled main/preload scripts

### Data flow

```
User input → useChatStream hook → POST /api/chat (SSE) → AI SDK / Bedrock streaming
    ↓                                                                ↓
Zustand chat-store (appendToken, addToolCall, etc.)   SSE chunks: text-delta, reasoning,
    ↓                                                  tool-call, tool-result, tool-error
React components (Memoized MessageBubble)
```

The `use-chat-stream` hook (in `src/hooks/use-chat-stream.ts`) orchestrates the entire send flow: it validates credentials, creates conversations, builds memory-augmented system prompts, manages tool contexts, and parses SSE events. It dispatches to chat-store, research-store, and memory-store as events arrive.

### Multi-provider LLM routing

`server/index.ts` `POST /api/chat` is the central routing point. It handles providers via two paths:

1. **AI SDK path** (OpenAI, Anthropic, Google, DeepSeek, Ollama) — uses `@ai-sdk/*` provider packages and `streamText()`
2. **Custom Bedrock path** — uses a hand-written streaming loop (`server/bedrock-service.ts`) with its own tool-calling loop (up to 20 turns), since the Bedrock Converse API doesn't fit the AI SDK abstraction

**Provider-specific nuances** (all in `server/index.ts`):
- **DeepSeek**: `stopWhen: stepCountIs(1)` — only one tool-call step, then a **second synthesis phase** runs `streamText()` again with tool results injected as a user message
- **DeepSeek**: `v4-pro` model is downgraded to `v4-flash` when tools are requested (the pro model doesn't support tool calling)
- **Anthropic**: `thinking: { type: 'enabled', budgetTokens: 10000 }` passed as `providerOptions`
- **Ollama**: hardcoded `baseURL: 'http://localhost:11434/v1'` with `apiKey: 'ollama'`
- **Image filtering**: DeepSeek and Bedrock don't support `image_url` content blocks; `filterImagesFromMessages()` strips them before sending

Provider definitions and model lists are in `src/lib/providers.ts`. Model capability detection (reasoning, vision, context size) is in `src/lib/model-capabilities.ts`.

### State management (Zustand)

All stores are in `src/stores/` and use Zustand 5. The key ones:

| Store | Purpose |
|---|---|
| `agent-store` | Agent CRUD, active agent selection |
| `chat-store` | Conversations, messages, streaming state (appendToken, tool calls) |
| `api-key-store` | Client-side API keys (localStorage), AWS credentials |
| `memory-store` | Agent memories with `lastUsedAt` tracking |
| `mcp-store` | MCP server connections and capability discovery |
| `research-store` | Deep-research stage progress (planning → searching → ... → reporting) |
| `ui-store` | Theme, auto-speak, sidebar state |

Stores are accessed via selectors to minimize re-renders (e.g., `useAgentStore((s) => s.agents)`).

### Database layer (`server/db.ts`)

- sql.js in-memory SQLite, persisted to `~/.llm-chat/data.db` every 5 seconds (debounced via `setInterval` + dirty flag)
- AES-256-GCM encryption when `LLM_CHAT_MASTER_PASSWORD` env var is set (scrypt key derivation, cached per process)
- Schema version tracking (`SCHEMA_VERSION = 8`) with automatic migrations
- Tables: `agents`, `projects`, `conversations`, `messages`, `memories`, `vectors`, `documents`, `api_keys`
- Exports `query`, `queryOne`, `run` helpers used by `db-routes.ts`, `api-keys.ts`, and RAG modules
- API key storage: keys are AES-encrypted in the `agents.api_key_encrypted` column (`server/crypto.ts` → `server/api-keys.ts`). The legacy per-field encryption in `crypto.ts` is deprecated but kept for migration
- `server/db-routes.ts` provides REST CRUD for agents, conversations, messages, memories, and projects

### Built-in tools system (`server/tools/`)

12 built-in tools with three risk levels:
- **safe** (auto-execute): web-fetch, web-search, calculator, pdf-reader, datetime, search-document
- **costly** (approval required): file-reader, image-generator, deep-research, index-document
- **destructive** (approval required): code-executor, file-writer

Each tool can have:
- A static `tool` (always-available AI SDK tool object)
- A `factory` function that takes an API key (for tools needing OpenAI access, e.g. image-generator, web-search with LLM query rewriting)
- A `conditionallyEnabled` function (e.g. pdf-reader only when a PDF is uploaded)

Tools are resolved per-request: `resolveAvailableTools()` in `src/lib/tool-resolver.ts` computes the final enabled set from agent preferences, manual overrides, and runtime context. The tool list is exposed to the frontend via `GET /api/tools/built-in` for the agent settings UI.

### MCP integration

MCP servers connect via stdio, SSE, or streamable-http transports. The `server/mcp-manager.ts` manages connection lifecycle. `server/tool-bridge.ts` converts MCP tool schemas to Vercel AI SDK tool format. The frontend MCP UI (`src/components/mcp/`) supports import from file, URL, or npx command, plus pre-configured presets (`server/mcp-presets.ts`).

### Memory & RAG system

- Memories are extracted from conversations via `POST /api/extract-memories` (LLM-powered, uses a small/fast model per provider)
- Semantic search: OpenAI text-embedding-3-small embeddings, **lazy strategy** — embedded on first search, not on creation
- Vector search is pure-JS cosine similarity over sql.js `vectors` table (no native deps)
- When relevant memories are found, they're appended to the system prompt and `lastUsedAt` is updated
- `memory-store.ts` tracks which memories are used and highlights recently-used ones in the UI

### Frontend component patterns

- `MessageBubble` (`src/components/chat/message-bubble.tsx`) is wrapped in `React.memo` with a custom comparator — only re-renders on content/reasoning/streaming/tools/error changes, preventing cascade re-renders during streaming
- Message pagination: only the last 50 messages render by default, with "Load earlier messages" for older batches
- Reasoning transparency: SSE `reasoning` events populate `message.reasoning`; the UI shows collapsible `<think>` blocks with amber tint during streaming, auto-collapses when complete with word count and preview snippet
- `isGeneratingContent` flag tracks the transition from thinking → generating for the status indicator

### Electron

`electron/main.ts` creates the BrowserWindow and embeds the Express server. In production, the built frontend is served as static files (`ELECTRON_DIST_PATH`). The preload script (`electron/preload.ts`) provides a minimal context bridge.
