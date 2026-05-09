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

// Walk an error and its `cause` chain into a single lowercase blob we can
// substring-match. The wallet SDK / Azguard wraps the chain error inside an
// outer Error whose top-level `.message` is something generic ("Simulation
// failed"), with the real text living in `cause.message` or attached as a
// stringified payload. Pulling everything together makes the matcher
// resilient to whichever shape the wallet returns.
function flattenError(err: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (err == null || depth > 6 || seen.has(err)) return "";
  seen.add(err);
  const parts: string[] = [];
  if (typeof err === "string") parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message);
    parts.push(err.name);
    if ("cause" in err) parts.push(flattenError((err as Error & { cause?: unknown }).cause, depth + 1, seen));
  } else if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    parts.push(typeof e.message === "string" ? e.message : "");
    parts.push(typeof e.error === "string" ? e.error : "");
    parts.push(typeof e.details === "string" ? e.details : "");
    parts.push(typeof e.data === "string" ? e.data : "");
    if (e.cause) parts.push(flattenError(e.cause, depth + 1, seen));
    try {
      parts.push(JSON.stringify(e));
    } catch {
      // circular or otherwise un-stringifiable
    }
  } else {
    parts.push(String(err));
  }
  return parts.join(" ").toLowerCase();
}

// Translate raw chain errors into something the UI can show.
//
// `addressesMatch` disambiguates "no non-nullified L1 to L2 message" — the
// chain returns the same error whether (a) the bridge message was already
// consumed, or (b) the message simply doesn't exist for this (recipient,
// secret) pair (the wallet is for a different account). At the chain
// boundary they're indistinguishable, but here we know whether the
// connected wallet is the same as the drip recipient. Only treat it as
// "already claimed" when they match; otherwise it's a recipient mismatch
// the caller should have caught pre-flight.
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
  // The address the drip was sent to. The L1→L2 bridge message is keyed
  // on (recipient, secret); only this account can claim it. Passing it
  // explicitly lets us pre-flight-check that the connected wallet is the
  // bridge recipient before we waste a tx — and disambiguate the
  // resulting chain error if a mismatch slips through anyway.
  recipientHex: string,
): Promise<ClaimResult> {
  const address = AztecAddress.fromString(fromAddressHex);
  const claimAmount = BigInt(claim.claimAmount);
  const claimSecret = Fr.fromHexString(claim.claimSecretHex);
  const messageLeafIndex = BigInt(claim.messageLeafIndex);

  // Pre-flight: refuse to send if the wallet's connected account isn't
  // the bridge recipient. Saves a chain round-trip and produces a
  // clear actionable error instead of a misleading "already claimed".
  const addressesMatch = fromAddressHex.toLowerCase() === recipientHex.toLowerCase();
  if (!addressesMatch) {
    throw new ClaimRecipientMismatchError(recipientHex, fromAddressHex);
  }

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
      // Run the full-chain matcher first — it covers redeemed and duplicate
      // cases. If those don't match, fall through to the deployed-account
      // specific "you have no balance to pay gas" detector.
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

  // BatchCall.send / interaction.send return TxSendResultMined: { receipt: TxReceipt }
  // where TxReceipt has { txHash, blockNumber, ... }. Be tolerant of either shape
  // (some wallet adapters may return the inner receipt directly).
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
