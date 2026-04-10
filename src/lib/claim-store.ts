import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";

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

export class ClaimStore {
  private claims = new Map<string, StoredClaim>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aztecNode: any;
  readonly nodeUrl: string;

  constructor(aztecNodeUrl: string) {
    this.nodeUrl = aztecNodeUrl;
    this.aztecNode = createAztecNodeClient(aztecNodeUrl);
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
    }, POLL_INTERVAL_MS);
  }

  private async pollAll() {
    const now = Date.now();
    const bridgingClaims: StoredClaim[] = [];

    for (const [, claim] of this.claims) {
      if (now - claim.createdAt > CLAIM_EXPIRY_MS) {
        if (claim.status === "bridging") {
          claim.status = "expired";
        }
        continue;
      }
      if (claim.status === "bridging") {
        bridgingClaims.push(claim);
      }
    }

    if (bridgingClaims.length === 0) return;

    for (const claim of bridgingClaims) {
      try {
        const messageHash = Fr.fromHexString(claim.claimData.messageHashHex);
        // Uses getL1ToL2MessageCheckpoint (4.1.2-rc.1 SDK method) to check
        // if the bridge message has been included in an L2 checkpoint.
        const checkpointNumber = await this.aztecNode.getL1ToL2MessageCheckpoint(messageHash);
        const ready = checkpointNumber !== undefined &&
          (await this.aztecNode.getBlock("latest"))?.checkpointNumber >= checkpointNumber;

        if (ready) {
          claim.status = "ready";
          claim.readyAt = Date.now();
        }
      } catch (err) {
        console.error(`Polling claim ${claim.id} failed:`, err);
      }
    }

    // Clean up expired claims older than 1 hour
    for (const [id, claim] of this.claims) {
      if (now - claim.createdAt > 2 * CLAIM_EXPIRY_MS) {
        this.claims.delete(id);
      }
    }
  }

}
