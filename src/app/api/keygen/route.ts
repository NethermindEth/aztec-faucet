import { NextResponse } from "next/server";
import { Fr } from "@aztec/aztec.js/fields";
import { getSchnorrAccountContractAddress } from "@aztec/accounts/schnorr";

export async function GET() {
  try {
    const secret = Fr.random();
    const address = await getSchnorrAccountContractAddress(secret, Fr.ZERO);
    return NextResponse.json({
      secretKey: secret.toString(),
      address: address.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
