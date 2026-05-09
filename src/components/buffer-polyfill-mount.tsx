"use client";

// Side-effect import that runs the Buffer prototype patch on the client at
// the earliest possible time. Mounted in the root layout so it executes
// before any other client component (including dynamic-imported wallet code).
import "@/lib/buffer-polyfill";

export function BufferPolyfillMount() {
  return null;
}
