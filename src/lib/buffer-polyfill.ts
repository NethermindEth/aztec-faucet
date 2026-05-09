"use client";

// Why this file exists, in 2026:
//
// Next.js bundles its own stripped-down copy of the `buffer` package at
// node_modules/next/dist/compiled/buffer (27 KB). That copy does NOT define
// writeBigUInt64BE / readBigUInt64BE / their LE+signed siblings. Turbopack
// injects this stripped Buffer as `globalThis.Buffer` in browser bundles.
//
// @aztec/aztec.js (and friends) reference the global `Buffer` and call
// `Buffer.alloc(8).writeBigUInt64BE(...)` during claim-arg serialization.
// On Next's stripped copy, `buf.writeBigUInt64BE is not a function` — and
// the wallet claim flow blows up.
//
// The npm `buffer` package at our top-level node_modules/buffer (v6.0.3,
// 58 KB) DOES have all these methods. So we:
//   1. import { Buffer as NodeBuffer } from "buffer" (resolves to the full
//      top-level package)
//   2. replace globalThis.Buffer with NodeBuffer so any subsequent
//      `Buffer.alloc(...)` returns an instance whose prototype has the
//      BigInt helpers
//   3. as a safety net, also walk the Buffer-prototype chain and install
//      shim methods on any Buffer-shaped prototype that's still missing
//      them (in case some module captured the old Buffer reference before
//      we ran)
//
// Bigint guards in the shim bodies (`typeof value !== "bigint"`) keep things
// safe if Next's _error.js or anything else ends up invoking the shim with
// undefined args while iterating object keys.

import { Buffer as NodeBuffer } from "buffer";

type BufLike = {
  writeUInt32BE(v: number, offset?: number): number;
  writeUInt32LE(v: number, offset?: number): number;
  readUInt32BE(offset?: number): number;
  readUInt32LE(offset?: number): number;
  writeBigUInt64BE?: (v: bigint, offset?: number) => number;
  writeBigUInt64LE?: (v: bigint, offset?: number) => number;
  writeBigInt64BE?: (v: bigint, offset?: number) => number;
  writeBigInt64LE?: (v: bigint, offset?: number) => number;
  readBigUInt64BE?: (offset?: number) => bigint;
  readBigUInt64LE?: (offset?: number) => bigint;
  readBigInt64BE?: (offset?: number) => bigint;
  readBigInt64LE?: (offset?: number) => bigint;
};

function patch(proto: BufLike) {
  if (typeof proto.writeBigUInt64BE !== "function") {
    proto.writeBigUInt64BE = function (this: BufLike, value: bigint, offset = 0) {
      if (typeof value !== "bigint") return offset;
      this.writeUInt32BE(Number((value >> 32n) & 0xffffffffn), offset);
      this.writeUInt32BE(Number(value & 0xffffffffn), offset + 4);
      return offset + 8;
    };
  }
  if (typeof proto.writeBigUInt64LE !== "function") {
    proto.writeBigUInt64LE = function (this: BufLike, value: bigint, offset = 0) {
      if (typeof value !== "bigint") return offset;
      this.writeUInt32LE(Number(value & 0xffffffffn), offset);
      this.writeUInt32LE(Number((value >> 32n) & 0xffffffffn), offset + 4);
      return offset + 8;
    };
  }
  if (typeof proto.writeBigInt64BE !== "function") {
    proto.writeBigInt64BE = function (this: BufLike, value: bigint, offset = 0) {
      if (typeof value !== "bigint") return offset;
      const u = value < 0n ? value + (1n << 64n) : value;
      return this.writeBigUInt64BE!(u, offset);
    };
  }
  if (typeof proto.writeBigInt64LE !== "function") {
    proto.writeBigInt64LE = function (this: BufLike, value: bigint, offset = 0) {
      if (typeof value !== "bigint") return offset;
      const u = value < 0n ? value + (1n << 64n) : value;
      return this.writeBigUInt64LE!(u, offset);
    };
  }
  if (typeof proto.readBigUInt64BE !== "function") {
    proto.readBigUInt64BE = function (this: BufLike, offset = 0) {
      const hi = BigInt(this.readUInt32BE(offset));
      const lo = BigInt(this.readUInt32BE(offset + 4));
      return (hi << 32n) | lo;
    };
  }
  if (typeof proto.readBigUInt64LE !== "function") {
    proto.readBigUInt64LE = function (this: BufLike, offset = 0) {
      const lo = BigInt(this.readUInt32LE(offset));
      const hi = BigInt(this.readUInt32LE(offset + 4));
      return (hi << 32n) | lo;
    };
  }
  if (typeof proto.readBigInt64BE !== "function") {
    proto.readBigInt64BE = function (this: BufLike, offset = 0) {
      const u = this.readBigUInt64BE!(offset);
      return u >= (1n << 63n) ? u - (1n << 64n) : u;
    };
  }
  if (typeof proto.readBigInt64LE !== "function") {
    proto.readBigInt64LE = function (this: BufLike, offset = 0) {
      const u = this.readBigUInt64LE!(offset);
      return u >= (1n << 63n) ? u - (1n << 64n) : u;
    };
  }
}

// Only patch a prototype if it looks like a Buffer prototype — i.e. it already
// has the byte-write methods Buffer is built around. This is the cheap
// discriminator that lets us walk the chain (in case the SDK has nested
// copies of the `buffer` package with their own Buffer classes) without
// accidentally landing on Object.prototype / Uint8Array.prototype, which
// don't define writeUInt32BE and would just bequeath the shim to every
// object in the runtime.
function isBufferProto(p: unknown): p is BufLike {
  return typeof (p as BufLike | null)?.writeUInt32BE === "function";
}

function patchIfBufferLike(p: unknown, seen: WeakSet<object>) {
  if (!isBufferProto(p)) return;
  const obj = p as unknown as object;
  if (seen.has(obj)) return;
  seen.add(obj);
  patch(p);
}

if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as { Buffer?: typeof NodeBuffer };

  // Capture the old (potentially stripped) Buffer BEFORE swapping so we can
  // patch its prototype chain after the swap. After `g.Buffer = NodeBuffer`
  // we lose the reference to the old class and can no longer reach the
  // stripped prototype that captured modules still use.
  const oldBuffer = g.Buffer;

  // Step 1: replace the global Buffer with the full npm package's Buffer if
  // the current global lacks the BigInt helpers.
  const currentMissesBigInt =
    !g.Buffer ||
    typeof g.Buffer.prototype?.writeBigUInt64BE !== "function";
  if (currentMissesBigInt && NodeBuffer) {
    g.Buffer = NodeBuffer;
  }

  // Step 2: patch every Buffer-shaped prototype reachable — including the OLD
  // stripped Buffer. After the global swap above, `g.Buffer` points to
  // NodeBuffer, so any call to `patchIfBufferLike(g.Buffer.prototype)` would
  // only touch NodeBuffer (which already has the methods). We must explicitly
  // reach the old class via the saved `oldBuffer` reference.
  const seen = new WeakSet<object>();

  // Patch NodeBuffer's prototype (usually a no-op — it already has the methods,
  // but handles edge-cases where the npm `buffer` package is also stripped).
  patchIfBufferLike(NodeBuffer?.prototype, seen);

  // Patch the OLD global Buffer's prototype and its full chain. This is the
  // critical path: any module that was evaluated before this polyfill ran and
  // captured `Buffer` (or `Buffer.alloc`) from the old global will still hand
  // out instances whose `__proto__` is the OLD prototype. Installing the shims
  // there makes those stale instances work without re-importing.
  if (oldBuffer && oldBuffer !== (NodeBuffer as unknown)) {
    patchIfBufferLike(oldBuffer.prototype, seen);
    try {
      const probe = oldBuffer.alloc(8);
      let pp: object | null = Object.getPrototypeOf(probe);
      while (isBufferProto(pp)) {
        patchIfBufferLike(pp, seen);
        pp = Object.getPrototypeOf(pp);
      }
    } catch {
      // ignore
    }
  }

  // Also walk NodeBuffer's prototype chain in case there are nested buffer
  // package copies somewhere in the module graph.
  try {
    const probe = NodeBuffer.alloc(8);
    let pp: object | null = Object.getPrototypeOf(probe);
    while (isBufferProto(pp)) {
      patchIfBufferLike(pp, seen);
      pp = Object.getPrototypeOf(pp);
    }
  } catch {
    // ignore
  }
}

export {};
