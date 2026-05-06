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
  // Explicitly include pino transport packages in the standalone output.
  // These are dynamically loaded by the Aztec SDK's pino logger via worker
  // threads — the static file tracer misses them without this hint.
  // COOP/COEP headers are needed in production for Barretenberg WASM
  // (SharedArrayBuffer in cross-origin-isolated context). On localhost,
  // browsers auto-enable SharedArrayBuffer without these headers, AND the
  // headers can interfere with browser extension content-script messaging
  // (Azguard discovery broadcasts time out). Skip in dev.
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
