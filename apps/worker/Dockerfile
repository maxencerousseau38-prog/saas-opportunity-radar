# syntax=docker/dockerfile:1
# Persistent worker image (Sprint 7; PD-27: Render Background Worker,
# Frankfurt). Build context: the repository root.
#   docker build -f apps/worker/Dockerfile -t sor-worker .
# The runtime stage holds Node.js and one self-contained bundle only: no
# pnpm, no node_modules, no source, no secrets (all configuration comes from
# environment variables validated at startup by @sor/contracts/env).

FROM node:26.13.0-slim AS build
WORKDIR /repo
# Node.js 25+ no longer ships Corepack: install the pnpm version pinned by
# the root package.json ("packageManager") explicitly.
RUN npm install --global --no-fund --no-audit pnpm@10.34.9
COPY . .
RUN pnpm install --frozen-lockfile --filter "@sor/worker..." \
 && pnpm --filter @sor/worker build:container

FROM node:26.13.0-slim AS runtime
ENV NODE_ENV=production \
    # Instance plan 0.5c-512mb: keep the heap well below the container limit.
    NODE_OPTIONS="--max-old-space-size=320 --enable-source-maps"
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/worker/dist-container/ ./
USER node
# Node.js handles SIGTERM itself (graceful drain, apps/worker/src/main.ts).
CMD ["node", "main.js"]
