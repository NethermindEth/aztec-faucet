"use client";

import "@/lib/buffer-polyfill";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { flattenError, isUserRejection, isWalletDisconnected, WalletUserRejectedError, WalletDisconnectedError } from "@/lib/wallet-errors";
import { addressesMatch } from "@/lib/address";

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

// sameAccount disambiguates "no non-nullified L1 to L2 message": same chain
// error whether already-consumed or wrong recipient. Only consumed if match.
function humaniseClaimError(err: unknown, sameAccount: boolean): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const blob = flattenError(err);
  if (blob.includes("no non-nullified l1 to l2 message") && sameAccount) {
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

  const sameAccount = addressesMatch(fromAddressHex, recipientHex);
  if (!sameAccount) {
    throw new ClaimRecipientMismatchError(recipientHex, fromAddressHex);
  }

  // Single path for fresh AND initialized accounts: check_balance(0n) no-op
  // + FeeJuicePaymentMethodWithClaim. The fee payload claims and ends setup;
  // the no-op gives the wallet something to wrap, which bundles the deploy
  // for fresh accounts. Azguard 0.13.x can only execute this shape for
  // self-paid dapp txs, and repeat claims are safe on 4.3.x (see #41).
  const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");
  const feeJuice = FeeJuiceContract.at(wallet);

  let receipt: unknown;
  try {
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, {
      claimAmount,
      claimSecret,
      messageLeafIndex,
    });
    receipt = await feeJuice.methods
      .check_balance(0n)
      .send({ from: address, fee: { paymentMethod } });
  } catch (err) {
    // Declined popup / wallet drop are expected; do not console.error.
    if (isUserRejection(err)) throw new WalletUserRejectedError(err);
    if (isWalletDisconnected(err)) throw new WalletDisconnectedError(err);
    console.error("[claim-via-wallet] send threw:", err);
    throw humaniseClaimError(err, sameAccount);
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
