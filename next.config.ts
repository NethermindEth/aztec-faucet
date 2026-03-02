import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // Aztec SDK packages are ESM-only with native modules;
  // keep them server-side only to avoid bundling issues
  serverExternalPackages: [
    "@aztec/aztec.js",
    "@aztec/accounts",
    "@aztec/noir-contracts.js",
    "@aztec/wallets",
    "@aztec/pxe",
    "@aztec/kv-store",
    "@aztec/ethereum",
    "@aztec/l1-artifacts",
    "@aztec/foundation",
    "@aztec/stdlib",
    // pino transport packages — loaded dynamically so not auto-traced
    "pino",
    "pino-pretty",
    "thread-stream",
  ],
  // Explicitly include pino transport packages in the standalone output
  // because they're loaded dynamically by the Aztec SDK's logger and
  // the static file tracer doesn't follow dynamic require() calls
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pino-pretty/**",
      "./node_modules/thread-stream/**",
      "./node_modules/sonic-boom/**",
      "./node_modules/atomically/**",
    ],
  },
};

export default nextConfig;
