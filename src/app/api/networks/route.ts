import { NextResponse } from "next/server";

export async function GET() {
  // Testnet is always available — public defaults exist for all network vars.
  // Set TESTNET_AZTEC_NODE_URL in .env to override the default endpoint.
  return NextResponse.json({
    testnet: true,
  });
}
