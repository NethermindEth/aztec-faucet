"use client";

import "@/lib/buffer-polyfill";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import type { Wallet } from "@aztec/aztec.js/wallet";

export type ClaimDataInput = {
  claimAmount: string;
  claimSecretHex: string;
  messageLeafIndex: string;
};

export type ClaimResult = {
  txHash: string;
  blockNumber?: number;
};

export class ClaimStuckAccountError extends Error {
  constructor(addr: string) {
    super(
      `Wallet account ${addr.slice(0, 10)}…${addr.slice(-6)} is deployed but has zero Fee Juice. ` +
        `claim_and_end_setup was already used so we can't atomically deploy+claim, ` +
        `and the account has no balance to pay for a plain claim. ` +
        `Use the CLI option below, or claim with a fresh wallet account.`,
    );
    this.name = "ClaimStuckAccountError";
  }
}

export class ClaimSetupNullifierConsumedError extends Error {
  constructor(addr: string) {
    super(
      `Wallet account ${addr.slice(0, 10)}…${addr.slice(-6)} is in a stuck state: ` +
        `its setup-end nullifier was already emitted by a prior partial transaction, ` +
        `but the account contract isn't fully deployed. claim_and_end_setup can only ` +
        `run once per account, so this account can't be funded via the faucet. ` +
        `Create a new account in your wallet (or use the CLI option below with a fresh keypair).`,
    );
    this.name = "ClaimSetupNullifierConsumedError";
  }
}

export async function claimFeeJuiceViaWallet(
  wallet: Wallet,
  fromAddressHex: string,
  claim: ClaimDataInput,
): Promise<ClaimResult> {
  const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");

  const address = AztecAddress.fromString(fromAddressHex);
  const claimAmount = BigInt(claim.claimAmount);
  const claimSecret = Fr.fromHexString(claim.claimSecretHex);
  const messageLeafIndex = BigInt(claim.messageLeafIndex);

  // Pick the right path based on whether the account is already deployed.
  // - Undeployed: FeeJuicePaymentMethodWithClaim → wallet uses FEE_JUICE_WITH_CLAIM
  //   (claim_and_end_setup + claim, single tx that deploys + claims atomically).
  //   claim_and_end_setup emits a setup-end nullifier that is one-shot per account.
  // - Deployed: plain claim, wallet uses PREEXISTING_FEE_JUICE (uses existing FJ
  //   balance to pay gas; the claim adds more FJ).
  //
  // Check via the public node directly so we don't need wallet permission to
  // read the user's own account contract metadata (which would require a
  // capability grant for the user's address — chicken-and-egg, since we only
  // learn the address from requestCapabilities itself).
  const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
  const { NODE_URL } = await import("@/lib/network-config");
  const node = createAztecNodeClient(NODE_URL);
  const instance = await node.getContract(address).catch(() => null);
  const isDeployed = !!instance;

  const feeJuice = FeeJuiceContract.at(wallet);
  const interaction = feeJuice.methods.claim(
    address,
    claimAmount,
    claimSecret,
    new Fr(messageLeafIndex),
  );

  let receipt: unknown;
  if (!isDeployed) {
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, {
      claimAmount,
      claimSecret,
      messageLeafIndex,
    });
    try {
      receipt = await interaction.send({
        from: address,
        fee: { paymentMethod },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("duplicate siloed nullifier")) {
        throw new ClaimSetupNullifierConsumedError(fromAddressHex);
      }
      throw err;
    }
  } else {
    try {
      receipt = await interaction.send({ from: address });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Heuristic: PREEXISTING_FEE_JUICE path failed because the account has
      // no balance to pay for the tx. Surface a clearer error.
      if (
        msg.toLowerCase().includes("insufficient") ||
        msg.toLowerCase().includes("balance") ||
        msg.toLowerCase().includes("paymentmethod") ||
        msg.toLowerCase().includes("fee")
      ) {
        throw new ClaimStuckAccountError(fromAddressHex);
      }
      throw err;
    }
  }

  const r = receipt as {
    txHash?: { toString(): string };
    blockNumber?: number;
  };
  return {
    txHash: r.txHash?.toString() ?? "",
    blockNumber: r.blockNumber,
  };
}
