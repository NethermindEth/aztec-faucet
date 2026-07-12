import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { promises as fs } from "fs";
import path from "path";

import type { FeeJuiceClaimData } from "./l2-faucet";

type ClaimStatus = "bridging" | "ready" | "expired";

export type StoredClaim = {
  id: string;
  address: string;
  claimData: FeeJuiceClaimData;
  status: ClaimStatus;
  createdAt: number;
  readyAt?: number;
};

const POLL_INTERVAL_MS = 5_000;
export const CLAIM_EXPIRY_MS = 30 * 60 * 1_000; // 30 minutes

/**
 * Optional file-based persistence path. Set `CLAIM_STORE_PATH` in production
 * to a path on a persistent volume so in-flight claims survive pod restarts
 * (e.g. ArgoCD auto-deploys). If unset, claims live in memory only and are
 * lost on restart — acceptable in dev.
 */
const CLAIM_STORE_PATH = process.env.CLAIM_STORE_PATH;

export class ClaimStore {
  private claims = new Map<string, StoredClaim>();
  private aztecNode: AztecNode;
  readonly nodeUrl: string;
  private persistPromise: Promise<void> = Promise.resolve();

  constructor(aztecNodeUrl: string) {
    this.nodeUrl = aztecNodeUrl;
    this.aztecNode = createAztecNodeClient(aztecNodeUrl);
    if (CLAIM_STORE_PATH) {
      this.loadFromDisk().catch((err) => {
        console.error("ClaimStore: failed to load persisted claims:", err);
      });
    }
    this.startPolling();
  }

  add(address: string, claimData: FeeJuiceClaimData): string {
    const id = crypto.randomUUID();
    const normalized = address.toLowerCase();

    this.claims.set(id, {
      id,
      address: normalized,
      claimData,
      status: "bridging",
      createdAt: Date.now(),
    });

    this.schedulePersist();
    return id;
  }

  get(id: string): StoredClaim | undefined {
    return this.claims.get(id);
  }

  private startPolling() {
    setInterval(() => {
      this.pollAll().catch((err) => {
        console.error("ClaimStore polling error:", err);
      });
    }, POLL_INTERVAL_MS).unref?.();
  }

  private async pollAll() {
    const now = Date.now();
    const bridgingClaims: StoredClaim[] = [];
    let mutated = false;

    for (const [, claim] of this.claims) {
      if (now - claim.createdAt > CLAIM_EXPIRY_MS) {
        if (claim.status === "bridging") {
          claim.status = "expired";
          mutated = true;
        }
        continue;
      }
      if (claim.status === "bridging") {
        bridgingClaims.push(claim);
      }
    }

    if (bridgingClaims.length === 0) {
      // Still drop expired claims past the retention window.
      for (const [id, claim] of this.claims) {
        if (now - claim.createdAt > 2 * CLAIM_EXPIRY_MS) {
          this.claims.delete(id);
          mutated = true;
        }
      }
      if (mutated) this.schedulePersist();
      return;
    }

    // Hoist the latest-block fetch out of the per-claim loop — N claims used
    // to cost N RPC calls per 5s tick.
    let latestCheckpointNumber: number | undefined;
    try {
      latestCheckpointNumber = (await this.aztecNode.getBlock("latest"))?.checkpointNumber;
    } catch (err) {
      console.error("ClaimStore: getBlock(latest) failed:", err);
      return;
    }
    if (latestCheckpointNumber === undefined) return;

    for (const claim of bridgingClaims) {
      try {
        const messageHash = Fr.fromHexString(claim.claimData.messageHashHex);
        const checkpointNumber = await this.aztecNode.getL1ToL2MessageCheckpoint(messageHash);
        const ready = checkpointNumber !== undefined && latestCheckpointNumber >= checkpointNumber;

        if (ready) {
          claim.status = "ready";
          claim.readyAt = Date.now();
          mutated = true;
        }
      } catch (err) {
        console.error(`Polling claim ${claim.id} failed:`, err);
      }
    }

    // Drop claims past the retention window.
    for (const [id, claim] of this.claims) {
      if (now - claim.createdAt > 2 * CLAIM_EXPIRY_MS) {
        this.claims.delete(id);
        mutated = true;
      }
    }

    if (mutated) this.schedulePersist();
  }

  /**
   * Coalesce concurrent persist calls into a single chained write. Avoids
   * interleaved fs writes if pollAll and add() race.
   */
  private schedulePersist() {
    if (!CLAIM_STORE_PATH) return;
    this.persistPromise = this.persistPromise.then(() => this.persistToDisk());
  }

  private async persistToDisk() {
    if (!CLAIM_STORE_PATH) return;
    try {
      const dir = path.dirname(CLAIM_STORE_PATH);
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${CLAIM_STORE_PATH}.tmp`;
      const payload = JSON.stringify(Array.from(this.claims.values()));
      await fs.writeFile(tmp, payload, "utf8");
      await fs.rename(tmp, CLAIM_STORE_PATH);
    } catch (err) {
      console.error("ClaimStore: persist failed:", err);
    }
  }

  private async loadFromDisk() {
    if (!CLAIM_STORE_PATH) return;
    let raw: string;
    try {
      raw = await fs.readFile(CLAIM_STORE_PATH, "utf8");
    } catch (err) {
      // ENOENT just means we're starting fresh.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("ClaimStore: read failed:", err);
      }
      return;
    }
    try {
      const arr = JSON.parse(raw) as StoredClaim[];
      const now = Date.now();
      for (const claim of arr) {
        // Skip claims that have already aged past the retention window.
        if (now - claim.createdAt > 2 * CLAIM_EXPIRY_MS) continue;
        this.claims.set(claim.id, claim);
      }
      console.log(`ClaimStore: loaded ${this.claims.size} persisted claim(s)`);
    } catch (err) {
      console.error("ClaimStore: parse failed:", err);
    }
  }
}
