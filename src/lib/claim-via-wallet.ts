"use client";

import "@/lib/buffer-polyfill";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { BatchCall } from "@aztec/aztec.js/contracts";
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
        `The claim_and_end_setup hook was already consumed for this account, ` +
        `and there's no balance to pay for a plain claim. ` +
        `Use the CLI option below, or claim with a fresh wallet account.`,
    );
    this.name = "ClaimStuckAccountError";
  }
}

export async function claimFeeJuiceViaWallet(
  wallet: Wallet,
  fromAddressHex: string,
  claim: ClaimDataInput,
): Promise<ClaimResult> {
  const address = AztecAddress.fromString(fromAddressHex);
  const claimAmount = BigInt(claim.claimAmount);
  const claimSecret = Fr.fromHexString(claim.claimSecretHex);
  const messageLeafIndex = BigInt(claim.messageLeafIndex);

  // Pick the right path based on whether the account is already deployed.
  //
  // - Undeployed (no prior FJ balance): empty BatchCall with
  //   FeeJuicePaymentMethodWithClaim as the fee payer. The payment method's
  //   setup phase runs `claim_and_end_setup`, which atomically (a) consumes the
  //   L1→L2 bridge message, (b) mints the claimed FJ to the recipient, and
  //   (c) ends setup. No app-phase calls — adding `feeJuice.methods.claim(...)`
  //   here would re-consume the same bridge message and the tx would revert
  //   with "Duplicate siloed nullifier". Pattern verified against
  //   holonym-foundation/aztec-bridge.
  //
  // - Deployed (account already initialized and has FJ balance): the bridge
  //   message has not yet been claimed, but the account exists. Plain
  //   `feeJuice.methods.claim(...)` with no payment method — wallet uses
  //   PREEXISTING_FEE_JUICE to pay gas from existing balance.
  //
  // Deploy detection uses `node.getContract()` which reads from the proven
  // tip. The proven tip can lag the proposed tip by 5-15 minutes on testnet,
  // so a freshly-deployed account may briefly look undeployed. That's fine
  // for *this* flow because if the account just deployed via FEE_JUICE_WITH_CLAIM
  // it already has an FJ balance, which means the bridge message it claimed
  // is gone — there's nothing for us to claim a second time anyway. Users in
  // that window will see a "no claim available" type error and just need to
  // wait or request another drip to a different account.
  const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
  const { NODE_URL } = await import("@/lib/network-config");
  const node = createAztecNodeClient(NODE_URL);
  const instance = await node.getContract(address).catch(() => null);
  const isDeployed = !!instance;

  let receipt: unknown;
  if (!isDeployed) {
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, {
      claimAmount,
      claimSecret,
      messageLeafIndex,
    });
    const batch = new BatchCall(wallet, []);
    receipt = await batch.send({
      from: address,
      fee: { paymentMethod },
    });
  } else {
    const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");
    const feeJuice = FeeJuiceContract.at(wallet);
    const interaction = feeJuice.methods.claim(
      address,
      claimAmount,
      claimSecret,
      new Fr(messageLeafIndex),
    );
    try {
      receipt = await interaction.send({ from: address });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
