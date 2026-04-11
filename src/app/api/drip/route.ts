import { NextResponse } from "next/server";
import {
  FaucetManager,
  ThrottleError,
  AddressValidationError,
  type Asset,
} from "@/lib/faucet-manager";
import { verifyTurnstileToken } from "@/lib/turnstile";

const VALID_ASSETS: Asset[] = ["eth", "fee-juice"];

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }

  try {
    const { address, asset, captchaToken } = body as Record<string, unknown>;

    // Validate inputs
    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 },
      );
    }

    if (!asset || !VALID_ASSETS.includes(asset as Asset)) {
      return NextResponse.json(
        { error: `Invalid asset. Must be one of: ${VALID_ASSETS.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify CAPTCHA
    const captchaStr = typeof captchaToken === "string" ? captchaToken : "";
    const captchaValid = await verifyTurnstileToken(captchaStr);
    if (!captchaValid) {
      return NextResponse.json(
        { error: "CAPTCHA verification failed. Please complete the CAPTCHA and try again." },
        { status: 403 },
      );
    }

    // Extract client IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0]?.trim() || realIp || undefined;

    // Execute drip
    const manager = FaucetManager.getInstance();
    const result = await manager.drip(address, asset as Asset, ip);

    return NextResponse.json(result);
  } catch (err) {
    // Use both instanceof and .name check — the name check handles Next.js HMR
    // module reloads where the class reference changes but the singleton persists.
    if (err instanceof AddressValidationError || (err instanceof Error && err.name === "AddressValidationError")) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }

    if (err instanceof ThrottleError || (err instanceof Error && err.name === "ThrottleError")) {
      const throttleErr = err as ThrottleError;
      return NextResponse.json(
        { error: err.message, retryAfter: throttleErr.retryAfter },
        { status: 429 },
      );
    }

    console.error("Drip error:", err);
    // Use the error message if it came from our own faucet code (clean, user-safe).
    // Raw SDK/viem errors are logged above but not exposed — show a generic fallback instead.
    const raw = err instanceof Error ? err.message : "";
    const isFaucetError = raw.startsWith("Could not connect") || raw.startsWith("The Fee Juice bridge");
    const message = isFaucetError
      ? raw
      : "Something went wrong on our end. Please wait a moment and try again.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
