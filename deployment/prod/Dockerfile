# syntax=docker/dockerfile:1
# Multi-stage build for ANY client `web` app (Next.js standalone) in the pnpm
# monorepo. Context is the repo root. Pick the app with `--build-arg APP=<name>`
# (default tiffin-grab). Produces a slim runner; the `build` target is reused by
# the compose `migrate` service (it keeps drizzle-kit + source).

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat
# node:26-alpine no longer bundles corepack; install pnpm pinned to packageManager.
RUN npm install -g pnpm@10.34.4
WORKDIR /app

# --- build: fetch (cached on lockfile) → offline install → next build ---
FROM base AS build
ARG APP=tiffin-grab
# fetch populates the pnpm store from the lockfile alone; this layer is cached
# until pnpm-lock.yaml changes, so source edits don't re-download deps.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
# Build-only placeholders, inlined on the build command so they never persist as
# image ENV (silences Docker's SecretsUsedInArgOrEnv). next build imports route
# modules that throw at load if these are unset; all clients connect lazily, so no
# real service is touched. Runtime values come from .env.production (compose env_file).
RUN DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
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
