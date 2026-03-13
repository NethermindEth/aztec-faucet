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
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_GITHUB_BRANCH=main
ENV NEXT_PUBLIC_GITHUB_BRANCH=$NEXT_PUBLIC_GITHUB_BRANCH
RUN npm run build

# --- Run ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Suppress pino transport initialization (prevents pino-pretty worker threads)
ENV LOG_LEVEL=silent

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Overlay full node_modules so dynamically-loaded packages (pino transports
# and other deps not traced by Next.js standalone) are always available
COPY --from=deps /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
