import { NextResponse } from "next/server";
import { FaucetManager } from "@/lib/faucet-manager";

export async function GET(request: Request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
  };

  try {
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network") === "testnet" ? "testnet" : "devnet";
    const manager = FaucetManager.getInstance(network);
    const status = await manager.getStatus();
    return NextResponse.json(status, { headers: corsHeaders });
  } catch (err) {
    console.error("Status error:", err);
    return NextResponse.json(
      {
        healthy: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
