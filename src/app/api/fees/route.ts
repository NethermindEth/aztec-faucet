import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { NODE_URL } from "@/lib/network-config";
import { CORS_HEADERS_GET } from "@/lib/cors";

export async function GET() {
  try {
    const node = createAztecNodeClient(NODE_URL);

    const [fees, blockNumber] = await Promise.all([
      node.getCurrentMinFees(),
      node.getBlockNumber(),
    ]);

    return NextResponse.json(
      {
        feePerDaGas: fees.feePerDaGas.toString(),
        feePerL2Gas: fees.feePerL2Gas.toString(),
        blockNumber,
      },
      { headers: CORS_HEADERS_GET },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg.slice(0, 200) },
      { status: 500, headers: CORS_HEADERS_GET },
    );
  }
}
