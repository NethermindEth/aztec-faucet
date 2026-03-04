import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
};

export async function GET() {
  try {
    const nodeUrl = process.env.AZTEC_NODE_URL ?? "https://v4-devnet-2.aztec-labs.com/";
    const node = createAztecNodeClient(nodeUrl);

    const [info, blockNumber] = await Promise.all([
      node.getNodeInfo(),
      node.getBlockNumber(),
    ]);

    return NextResponse.json(
      {
        nodeVersion: info.nodeVersion,
        l1ChainId: info.l1ChainId,
        rollupVersion: info.rollupVersion,
        blockNumber,
        l1Contracts: info.l1ContractAddresses,
        l2Contracts: info.protocolContractAddresses,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500, headers: corsHeaders });
  }
}
