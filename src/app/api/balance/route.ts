import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { deriveStorageSlotInMap, siloNullifier } from "@aztec/stdlib/hash";

const AZTEC_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

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
      { status: 400 },
    );
  }

  try {
    const { NODE_URL } = await import("@/lib/network-config");
    const nodeUrl = NODE_URL;
    const node = createAztecNodeClient(nodeUrl);
    const owner = AztecAddress.fromString(address);
    const feeJuiceAddress = AztecAddress.fromBigInt(BigInt(5));
    const balanceSlot = await deriveStorageSlotInMap(new Fr(1), owner);
    const initNullifier = await siloNullifier(owner, new Fr(owner.toBigInt()));
    const [balanceField, nullifierWitness] = await Promise.all([
      node.getPublicStorageAt("latest", feeJuiceAddress, balanceSlot),
      node.getNullifierMembershipWitness("latest", initNullifier).catch(() => null),
    ]);
    const balance = balanceField.toBigInt();
    const isDeployed = nullifierWitness !== undefined && nullifierWitness !== null;

    return NextResponse.json({
      address,
      balanceRaw: balance.toString(),
      balanceFormatted: formatFeeJuice(balance),
      isDeployed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
