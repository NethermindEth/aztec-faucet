import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import { NODE_URL } from "@/lib/network-config";
import { CORS_HEADERS_GET } from "@/lib/cors";

const AZTEC_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

// Aztec protocol contract addresses are stable, well-known small ints.
// Reference: @aztec/protocol-contracts/protocol_contract_data.ts.
const FEE_JUICE_CONTRACT_ADDRESS = AztecAddress.fromBigInt(5n);
// FeeJuice contract stores per-account balances in a Noir Map at storage slot 1.
const FEE_JUICE_BALANCES_SLOT = new Fr(1);

export type DeploymentStatus = "deployed" | "pending" | "not_deployed";

function formatFeeJuice(raw: bigint): string {
  const str = raw.toString().padStart(19, "0");
  const intPart = str.slice(0, str.length - 18) || "0";
  const decPart = str.slice(str.length - 18, str.length - 14);
  return `${intPart}.${decPart}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!AZTEC_ADDRESS_RE.test(address)) {
    return NextResponse.json(
      { error: "Invalid Aztec address. Expected a 0x-prefixed 64-character hex string (e.g. 0x09a4...fb2)" },
      { status: 400, headers: CORS_HEADERS_GET },
    );
  }

  try {
    const node = createAztecNodeClient(NODE_URL);
    const owner = AztecAddress.fromString(address);
    const balanceSlot = await deriveStorageSlotInMap(FEE_JUICE_BALANCES_SLOT, owner);
    // Public storage reads from the latest *proposed* block, while getContract
    // reads from *proven* state. After a fresh deploy+claim, the balance is
    // visible on the proposed tip (immediately) but the contract instance only
    // becomes visible on the proven tip (~5–15 min later on testnet). We
    // surface this gap as a tri-state instead of saying "Not Deployed" while
    // a balance is sitting on the address.
    const [balanceField, instance] = await Promise.all([
      node.getPublicStorageAt("latest", FEE_JUICE_CONTRACT_ADDRESS, balanceSlot),
      node.getContract(owner).catch(() => undefined),
    ]);
    const balance = balanceField.toBigInt();
    const deploymentStatus: DeploymentStatus = instance
      ? "deployed"
      : balance > 0n
        ? "pending"
        : "not_deployed";

    return NextResponse.json({
      address,
      balanceRaw: balance.toString(),
      balanceFormatted: formatFeeJuice(balance),
      deploymentStatus,
    }, { headers: CORS_HEADERS_GET });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg.slice(0, 200) },
      { status: 500, headers: CORS_HEADERS_GET },
    );
  }
}
