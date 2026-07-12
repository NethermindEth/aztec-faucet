import { NextResponse } from "next/server";
import { FaucetManager } from "@/lib/faucet-manager";
import { CORS_HEADERS_GET } from "@/lib/cors";

export async function GET() {
  try {
    const manager = FaucetManager.getInstance();
    const status = await manager.getStatus();
    return NextResponse.json(status, { headers: CORS_HEADERS_GET });
  } catch (err) {
    console.error("Status error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        healthy: false,
        error: msg.slice(0, 200),
      },
      { status: 500, headers: CORS_HEADERS_GET },
    );
  }
}
