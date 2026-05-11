import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      // Turbopack's stripped Buffer lacks writeBigUInt64BE — swap to full npm buffer.
      "next/dist/compiled/buffer/index.js": "./node_modules/buffer/index.js",
      "next/dist/compiled/buffer": "./node_modules/buffer/index.js",
    },
  },
  // Aztec SDK packages are ESM-only with native modules;
  // keep them server-side only to avoid bundling issues
  serverExternalPackages: [
    "@aztec/aztec.js",
    "@aztec/accounts",
    "@aztec/wallets",
    "@aztec/ethereum",
    "@aztec/l1-artifacts",
    "@aztec/foundation",
    "@aztec/stdlib",
    "@aztec/bb.js",
    "@aztec/native",
    // pino transport packages — loaded dynamically so not auto-traced
    "pino",
    "pino-pretty",
    "thread-stream",
  ],
  // Barretenberg WASM needs cross-origin isolation in prod for SharedArrayBuffer.
  // In dev these headers break browser-extension messaging (Azguard discovery).
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pino-pretty/**",
      "./node_modules/pino-abstract-transport/**",
      "./node_modules/thread-stream/**",
      "./node_modules/sonic-boom/**",
      "./node_modules/atomically/**",
      "./node_modules/real-require/**",
      "./node_modules/colorette/**",
      "./node_modules/dateformat/**",
      "./node_modules/fast-safe-stringify/**",
      "./node_modules/jmespath/**",
      "./node_modules/fast-json-parse/**",
    ],
  },
};

export default nextConfig;
