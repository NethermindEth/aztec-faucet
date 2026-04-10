import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
};

export async function GET(request: Request) {
  try {
    const { NODE_URL } = await import("@/lib/network-config");
    const nodeUrl = NODE_URL;
    const node = createAztecNodeClient(nodeUrl);

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
      { headers: corsHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500, headers: corsHeaders });
  }
}
