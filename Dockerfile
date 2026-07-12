# Ubuntu 24.04 base — provides GLIBC 2.39 required by @aztec/bb.js native binary.
# node:24-slim only has GLIBC 2.36 which causes "Native backend process exited with code 1".
FROM ubuntu:24.04 AS base
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# Build tools needed to compile native addons (lmdb etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@10
COPY package.json package-lock.json ./
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

# --- Run ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV LOG_LEVEL=silent

# Build provenance — surfaced at /api/version so deployments can be
# verified (e.g. confirming ArgoCD has rolled a new image).
ARG GIT_SHA=unknown
ARG GIT_BRANCH=unknown
ARG BUILT_AT=unknown
ENV GIT_SHA=$GIT_SHA
ENV GIT_BRANCH=$GIT_BRANCH
ENV BUILT_AT=$BUILT_AT

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
