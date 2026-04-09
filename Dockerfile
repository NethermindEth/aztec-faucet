FROM node:24-slim AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# Build tools needed to compile native addons (lmdb etc.) on Linux slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
# Pin npm to the same major version used to generate the lock file.
# npm 11 changed how it validates npm-aliased packages in lock files and
# rejects the lockfileVersion 3 format we use for @aztec-rc/* aliases.
RUN npm install -g npm@10
COPY package.json package-lock.json ./
# Increase retries and timeout for large @aztec-rc packages (~hundreds of MB)
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 300000 && \
    npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_GITHUB_BRANCH=main
ENV NEXT_PUBLIC_GITHUB_BRANCH=$NEXT_PUBLIC_GITHUB_BRANCH
ARG NEXT_PUBLIC_CLARITY_TAG_ID
ENV NEXT_PUBLIC_CLARITY_TAG_ID=$NEXT_PUBLIC_CLARITY_TAG_ID
RUN npm run build

# --- Run with Bun ---
# Bun defines `typeof self === 'object'` in its main thread, which makes
# @aztec/foundation's IS_BROWSER check evaluate to true. This routes
# poseidon2Hash through BarretenbergSync (no worker threads) instead of
# the async Barretenberg path that spawns WASM workers without error
# handlers — fixing the process crash in containers.
FROM ubuntu:24.04 AS runner
WORKDIR /app

# Install Bun
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl unzip ca-certificates && \
    curl -fsSL https://bun.sh/install | bash && \
    rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.bun/bin:$PATH"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Suppress pino transport initialization (prevents pino-pretty worker threads)
ENV LOG_LEVEL=silent

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Overlay full node_modules so dynamically-loaded packages (pino transports
# and other deps not traced by Next.js standalone) are always available
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
