# ─── Build stage ───────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install deps (cache-friendly)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build frontend
COPY . .
RUN pnpm run build

# Prune to production deps only
RUN pnpm prune --prod

# ─── Runtime stage ─────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# tsx is used to run TS server directly in production
# (no separate compile step for server/)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy pruned deps and built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json

# Data volume — DB + attachments live here (DATA_DIR = $HOME/.llm-chat)
# Override HOME so the app stores data under /data/.llm-chat
ENV HOME=/data
ENV NODE_ENV=production
ENV PORT=3001
ENV ELECTRON_DIST_PATH=/app/dist
# Master password for DB-at-rest encryption — set via compose/env at runtime
# ENV LLM_CHAT_MASTER_PASSWORD=""

RUN mkdir -p /data/.llm-chat/attachments && chown -R node:node /data /app
USER node

EXPOSE 3001

# Basic healthcheck — hit the static index
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/ > /dev/null || exit 1

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
