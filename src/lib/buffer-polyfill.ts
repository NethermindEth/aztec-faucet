"use client";

// Turbopack's browser Buffer shim is missing the BigInt read/write helpers that
// @aztec/aztec.js uses to serialize claim args. The `buffer` npm package v6 has
// them, so we replace the global with that one and also defensively patch the
// prototype in case someone holds a reference to the shim's class.

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
      this.writeUInt32BE(Number((value >> 32n) & 0xffffffffn), offset);
      this.writeUInt32BE(Number(value & 0xffffffffn), offset + 4);
      return offset + 8;
    };
  }
  if (typeof proto.writeBigUInt64LE !== "function") {
    proto.writeBigUInt64LE = function (this: BufLike, value: bigint, offset = 0) {
      this.writeUInt32LE(Number(value & 0xffffffffn), offset);
      this.writeUInt32LE(Number((value >> 32n) & 0xffffffffn), offset + 4);
      return offset + 8;
    };
  }
  if (typeof proto.writeBigInt64BE !== "function") {
    proto.writeBigInt64BE = function (this: BufLike, value: bigint, offset = 0) {
      const u = value < 0n ? value + (1n << 64n) : value;
      return this.writeBigUInt64BE!(u, offset);
    };
  }
  if (typeof proto.writeBigInt64LE !== "function") {
    proto.writeBigInt64LE = function (this: BufLike, value: bigint, offset = 0) {
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

function applyPatchEverywhere(): { patched: number; details: string[] } {
  const details: string[] = [];
  let patched = 0;
  const seen = new WeakSet<object>();

  const tryPatch = (proto: BufLike | null | undefined, label: string) => {
    if (!proto) return;
    if (seen.has(proto as unknown as object)) return;
    seen.add(proto as unknown as object);
    const before = typeof proto.writeBigUInt64BE === "function";
    patch(proto);
    const after = typeof proto.writeBigUInt64BE === "function";
    details.push(
      `[${label}] writeBigUInt64BE: ${before ? "had" : "missing"} -> ${after ? "now present" : "STILL MISSING"}`,
    );
    if (!before && after) patched++;
  };

  if (typeof globalThis !== "undefined") {
    const g = globalThis as unknown as { Buffer?: typeof NodeBuffer };
    tryPatch(g.Buffer?.prototype as unknown as BufLike, "globalThis.Buffer.prototype");
    tryPatch(NodeBuffer?.prototype as unknown as BufLike, "NodeBuffer.prototype");
    try {
      const probe = (g.Buffer ?? NodeBuffer).alloc(8);
      tryPatch(Object.getPrototypeOf(probe) as BufLike, "alloc(8).__proto__");
      // Also walk up the prototype chain in case the methods live higher
      let pp: object | null = Object.getPrototypeOf(probe);
      let depth = 0;
      while (pp && depth < 4) {
        const next = Object.getPrototypeOf(pp);
        if (next) tryPatch(next as BufLike, `proto-chain[${depth + 1}]`);
        pp = next;
        depth++;
      }
    } catch (e) {
      details.push(`[probe failed] ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { patched, details };
}

if (typeof globalThis !== "undefined") {
  const result = applyPatchEverywhere();
  // eslint-disable-next-line no-console
  console.log("[buffer-polyfill] applied", result);
  // Re-run after a tick in case the SDK loads a fresh Buffer module later
  if (typeof setTimeout !== "undefined") {
    setTimeout(() => {
      const r2 = applyPatchEverywhere();
      // eslint-disable-next-line no-console
      console.log("[buffer-polyfill] retry", r2);
    }, 0);
  }
}

export {};
