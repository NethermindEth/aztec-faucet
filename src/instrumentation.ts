/**
 * Next.js instrumentation -- runs once at server startup before any request.
 *
 * Polyfills `globalThis.self` so that @aztec/foundation's IS_BROWSER check
 * (`typeof self !== 'undefined'`) evaluates to true. This routes poseidon2Hash
 * through BarretenbergSync (synchronous, no worker threads) instead of the
 * async Barretenberg path that spawns WASM workers without error handlers,
 * which crashes the Node.js process in containers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Make @aztec/foundation think we're in a browser context so it uses
    // BarretenbergSync instead of spawning WASM worker threads.
    globalThis.self = globalThis as typeof globalThis & typeof self;
  }
}
