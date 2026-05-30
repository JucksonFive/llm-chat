# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript LLM chat app with browser, server, and Electron entrypoints. `src/` contains the React frontend: `components/` for UI, `stores/` for Zustand state, `hooks/`, `lib/`, and shared `types/`. `server/` contains the Express API, database code, built-in tools, MCP integration, and RAG modules under `server/rag/`. `electron/` holds desktop main and preload scripts. `scripts/` contains build helpers, `plans/` stores design notes, and Docker/Caddy files support local search and production deployment. Tests are colocated as `*.test.ts`.

## Build, Test, and Development Commands

Use pnpm for all Node tasks.

- `pnpm install` installs dependencies from `pnpm-lock.yaml`.
- `pnpm dev` starts Docker Compose, the API server on port 3001, and Vite on port 5173.
- `pnpm dev:electron` runs the same stack plus the Electron shell.
- `pnpm build` runs TypeScript builds and creates the Vite production bundle.
- `pnpm build:electron` builds Electron entrypoints into `dist-electron/`.
- `pnpm dist` builds and packages the desktop app with electron-builder.
- `pnpm lint` runs ESLint across the repository.
- `pnpm test` runs Vitest once; `pnpm test:watch` runs it in watch mode.

## Coding Style & Naming Conventions

Write TypeScript and React with 2-space indentation, single quotes, and no semicolons. Prefer function components and hooks for UI logic. Use the `@/` alias for frontend imports from `src/`; server modules typically use relative imports. Keep component files kebab-case, store files named `*-store.ts`, and tests named after the unit under test, for example `memory-store.test.ts`.

## Testing Guidelines

Vitest runs in the Node environment by default and includes `server/**/*.test.ts` and `src/**/*.test.ts`. Add focused tests next to the code you change. For browser APIs or persisted Zustand stores, opt into jsdom with `// @vitest-environment jsdom` at the top of the test file. Cover data migrations, RAG behavior, tool execution, and store fallbacks when those paths change.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style such as `feat:`, `fix:`, `docs:`, and scoped forms like `feat(rag):`. Keep subjects imperative and specific. Pull requests should describe the change, list validation commands run, link related issues, and include screenshots or short recordings for visible UI or Electron behavior.

## Security & Configuration Tips

Keep secrets out of git. Use `.env.example` as the template and set `LLM_CHAT_MASTER_PASSWORD` locally when testing database encryption. Do not add provider keys, local databases, or generated release artifacts to commits.
