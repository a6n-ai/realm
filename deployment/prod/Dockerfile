# syntax=docker/dockerfile:1
# Multi-stage build for ANY client `web` app (Next.js standalone) in the pnpm
# monorepo. Context is the repo root. Pick the app with `--build-arg APP=<name>`
# (default tiffin-grab). Produces a slim runner; the `build` target is reused by
# the compose `migrate` service (it keeps drizzle-kit + source).

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
# node:26-alpine no longer bundles corepack; install pnpm pinned to the root
# package.json's `packageManager` so the two can never drift. A mismatched
# global pnpm makes `pnpm install` decide the modules dir `pnpm fetch`
# produced was built under different settings, and it aborts asking to purge it.
COPY package.json ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")

# --- build: fetch (cached on lockfile) → offline install → next build ---
FROM base AS build
ARG APP=tiffin-grab
# A docker build has no TTY, so anything pnpm wants to confirm interactively is
# an outright failure rather than a prompt. Saying "this is CI" up front makes it
# take the non-interactive branch instead of aborting.
ENV CI=true
# fetch populates the pnpm store from the lockfile alone; this layer is cached
# until pnpm-lock.yaml changes, so source edits don't re-download deps.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
# Build-only placeholders, inlined on the build command so they never persist as
# image ENV (silences Docker's SecretsUsedInArgOrEnv). next build imports route
# modules that throw at load if these are unset; all clients connect lazily, so no
# real service is touched. Runtime values come from .env.production (compose env_file).
# Cache mount persists Next's incremental build cache across CI runs (BuildKit gha
# cache backend keeps it) — turns most rebuilds into incremental ones instead of
# from-scratch compiles.
RUN --mount=type=cache,id=next-cache-${APP},target=/app/apps/${APP}/.next/cache \
    DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
    REDIS_URL="redis://127.0.0.1:6379" \
    BETTER_AUTH_SECRET="build-placeholder-not-used-at-runtime" \
    BETTER_AUTH_URL="http://localhost:3000" \
    pnpm --filter "${APP}" build

# --- runner: standalone output only, no node_modules install ---
FROM base AS runner
ARG APP=tiffin-grab
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP=${APP}
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# outputFileTracingRoot = monorepo root, so standalone nests the app under apps/${APP}
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# CMD is exec-form JSON so it can't expand $APP; go through sh to resolve the ENV.
CMD ["sh", "-c", "node apps/$APP/server.js"]
