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
      `This wallet account (${addr.slice(0, 10)}…${addr.slice(-6)}) has no Fee Juice and can't pay for the claim transaction. Request a fresh drip, or fund this account from the CLI.`,
    );
    this.name = "ClaimStuckAccountError";
  }
}

export class ClaimAlreadyRedeemedError extends Error {
  constructor() {
    super(
      "This drip has already been claimed. Request a new Fee Juice drip if you need more. Each L1 to L2 bridge message can only be redeemed once.",
    );
    this.name = "ClaimAlreadyRedeemedError";
  }
}

export class ClaimRecipientMismatchError extends Error {
  constructor(recipient: string, actualSender: string) {
    const r = `${recipient.slice(0, 10)}…${recipient.slice(-6)}`;
    const a = `${actualSender.slice(0, 10)}…${actualSender.slice(-6)}`;
    super(
      `This drip was sent to ${r} but the connected wallet account is ${a}. ` +
        `Switch to the wallet account that controls ${r}, or request a fresh drip for ${a}.`,
    );
    this.name = "ClaimRecipientMismatchError";
  }
}

// Walk err + err.cause into one lowercase blob; wallet SDKs wrap the real
// chain error inside generic outer messages and we need to substring-match.
function flattenError(err: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (err == null || depth > 6 || seen.has(err)) return "";
  seen.add(err);
  const parts: string[] = [];
  if (typeof err === "string") parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message, err.name);
    if ("cause" in err) parts.push(flattenError((err as Error & { cause?: unknown }).cause, depth + 1, seen));
  } else if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    for (const k of ["message", "error", "details", "data"]) {
      if (typeof e[k] === "string") parts.push(e[k] as string);
    }
    if (e.cause) parts.push(flattenError(e.cause, depth + 1, seen));
  } else {
    parts.push(String(err));
  }
  return parts.join(" ").toLowerCase();
}

// addressesMatch disambiguates "no non-nullified L1 to L2 message": same chain
// error whether already-consumed or wrong recipient. Only consumed if match.
function humaniseClaimError(err: unknown, addressesMatch: boolean): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const blob = flattenError(err);
  if (blob.includes("no non-nullified l1 to l2 message") && addressesMatch) {
    return new ClaimAlreadyRedeemedError();
  }
  if (blob.includes("duplicate siloed nullifier")) {
    return new ClaimAlreadyRedeemedError();
  }
  return original;
}

export async function claimFeeJuiceViaWallet(
  wallet: Wallet,
  fromAddressHex: string,
  claim: ClaimDataInput,
  recipientHex: string,
): Promise<ClaimResult> {
  const address = AztecAddress.fromString(fromAddressHex);
  const claimAmount = BigInt(claim.claimAmount);
  const claimSecret = Fr.fromHexString(claim.claimSecretHex);
  const messageLeafIndex = BigInt(claim.messageLeafIndex);

  const addressesMatch = fromAddressHex.toLowerCase() === recipientHex.toLowerCase();
  if (!addressesMatch) {
    throw new ClaimRecipientMismatchError(recipientHex, fromAddressHex);
  }

  // Undeployed: empty BatchCall + FeeJuicePaymentMethodWithClaim. Setup phase
  // runs claim_and_end_setup which atomically consumes the bridge message,
  // mints FJ, and ends setup. Adding feeJuice.claim() here would double-spend
  // the message ("Duplicate siloed nullifier").
  // Deployed: plain feeJuice.claim() — wallet uses PREEXISTING_FEE_JUICE.
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
    try {
      receipt = await batch.send({
        from: address,
        fee: { paymentMethod },
      });
    } catch (err) {
      throw humaniseClaimError(err, addressesMatch);
    }
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
      const translated = humaniseClaimError(err, addressesMatch);
      if (translated instanceof ClaimAlreadyRedeemedError) throw translated;
      const blob = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (
        blob.includes("insufficient") ||
        blob.includes("balance") ||
        blob.includes("paymentmethod") ||
        blob.includes("fee")
      ) {
        throw new ClaimStuckAccountError(fromAddressHex);
      }
      throw translated;
    }
  }

  const wrapper = receipt as {
    receipt?: { txHash?: { toString(): string }; blockNumber?: number };
    txHash?: { toString(): string };
    blockNumber?: number;
  };
  const inner = wrapper.receipt ?? wrapper;
  return {
    txHash: inner.txHash?.toString() ?? "",
    blockNumber: inner.blockNumber,
  };
}
