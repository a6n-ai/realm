# syntax=docker/dockerfile:1
# Multi-stage build for the `web` app (Next.js standalone) in a pnpm monorepo.
# Context is the repo root. Produces a slim runner; the `build` target is reused
# by the compose `migrate` service (it keeps drizzle-kit + source).

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat
# node:26-alpine no longer bundles corepack; install pnpm pinned to packageManager.
RUN npm install -g pnpm@10.34.4
WORKDIR /app

# --- build: fetch (cached on lockfile) → offline install → next build ---
FROM base AS build
# fetch populates the pnpm store from the lockfile alone; this layer is cached
# until pnpm-lock.yaml changes, so source edits don't re-download deps.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
# Build-only placeholders. next build imports route modules (which throw at load if
# these are unset); all clients connect lazily, so no real service is touched here.
# Runtime values come from .env.production via compose env_file.
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
    REDIS_URL="redis://127.0.0.1:6379" \
    BETTER_AUTH_SECRET="build-placeholder-not-used-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3000"
RUN pnpm --filter tiffin-grab build

# --- runner: standalone output only, no node_modules install ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# outputFileTracingRoot = monorepo root, so standalone nests the app under apps/tiffin-grab
COPY --from=build --chown=nextjs:nodejs /app/apps/tiffin-grab/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/tiffin-grab/.next/static ./apps/tiffin-grab/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/tiffin-grab/public ./apps/tiffin-grab/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/tiffin-grab/server.js"]
