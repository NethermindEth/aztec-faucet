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

  // Two cases, split on deployment state:
  //
  // Undeployed: check_balance(0n) no-op + FeeJuicePaymentMethodWithClaim.
  // The payment method's non-revertible setup phase runs claim_and_end_setup
  // (consumes the bridge message, mints FJ, ends account setup) and the
  // no-op call gives the wallet something to entrypoint-wrap, which is what
  // makes it bundle the account deploy. An empty BatchCall doesn't work:
  // nothing to wrap means no deploy, and on a brand-new wallet the tx
  // times out entirely.
  //
  // Deployed: plain claim() with the fee paid from the existing FJ balance.
  // claim_and_end_setup can only run once per account (it emits the setup
  // nullifier), so reusing the payment method here fails with
  // "Existing nullifier".
  const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");
  const feeJuice = FeeJuiceContract.at(wallet);

  // Initialization check. The wallet's PXE is the only definitive source:
  // it holds the account instance and computes the private init nullifier
  // (node.getContract can't see unpublished account contracts, and the
  // public init nullifier isn't emitted by Schnorr accounts). If the wallet
  // refuses the metadata call (capability scope), fall back to treating
  // "has FJ balance" as initialized: faucet claims deploy + mint atomically,
  // so FJ on the address implies a successful prior deploy.
  let isDeployed: boolean;
  try {
    const metadata = await wallet.getContractMetadata(address);
    const status = (metadata as { initializationStatus?: string }).initializationStatus;
    isDeployed = status === "INITIALIZED";
  } catch (metaErr) {
    console.warn("[claim-via-wallet] getContractMetadata failed, using balance heuristic:", metaErr);
    const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
    const { deriveStorageSlotInMap } = await import("@aztec/stdlib/hash");
    const { NODE_URL } = await import("@/lib/network-config");
    const node = createAztecNodeClient(NODE_URL);
    const feeJuiceAddress = AztecAddress.fromBigInt(5n);
    const slot = await deriveStorageSlotInMap(new Fr(1), address);
    const balanceField = await node
      .getPublicStorageAt("latest", feeJuiceAddress, slot)
      .catch(() => null);
    isDeployed = (balanceField?.toBigInt() ?? 0n) > 0n;
  }

  let receipt: unknown;
  try {
    if (!isDeployed) {
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, {
        claimAmount,
        claimSecret,
        messageLeafIndex,
      });
      receipt = await feeJuice.methods
        .check_balance(0n)
        .send({ from: address, fee: { paymentMethod } });
    } else {
      receipt = await feeJuice.methods
        .claim(address, claimAmount, claimSecret, new Fr(messageLeafIndex))
        .send({ from: address });
    }
  } catch (err) {
    // Surface the raw wallet/SDK error to the browser console so devs can
    // see what actually broke. The humanised error below only catches
    // double-spend; everything else propagates as-is.
    console.error("[claim-via-wallet] send threw:", err);
    throw humaniseClaimError(err, addressesMatch);
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
