"use client";

// Turbopack injects a stripped Buffer that lacks writeBigUInt64BE et al.
// @aztec/aztec.js calls those during claim-arg serialization. We swap in
// the full npm `buffer` package and patch any captured prototypes.

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

// Cheap discriminator: a real Buffer proto has writeUInt32BE. Object.prototype
// and Uint8Array.prototype don't, so walking up the chain stays bounded.
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

  // Capture old Buffer BEFORE swap so we can patch any captured prototypes.
  const oldBuffer = g.Buffer;
  const currentMissesBigInt =
    !g.Buffer ||
    typeof g.Buffer.prototype?.writeBigUInt64BE !== "function";
  if (currentMissesBigInt && NodeBuffer) {
    g.Buffer = NodeBuffer;
  }

  const seen = new WeakSet<object>();
  patchIfBufferLike(NodeBuffer?.prototype, seen);

  // Modules captured before this ran still hand out instances on the old
  // prototype chain — patch those too.
  if (oldBuffer && oldBuffer !== (NodeBuffer as unknown)) {
    patchIfBufferLike(oldBuffer.prototype, seen);
    try {
      let pp: object | null = Object.getPrototypeOf(oldBuffer.alloc(8));
      while (isBufferProto(pp)) {
        patchIfBufferLike(pp, seen);
        pp = Object.getPrototypeOf(pp);
      }
    } catch {}
  }

  try {
    let pp: object | null = Object.getPrototypeOf(NodeBuffer.alloc(8));
    while (isBufferProto(pp)) {
      patchIfBufferLike(pp, seen);
      pp = Object.getPrototypeOf(pp);
    }
  } catch {}
}

export {};
