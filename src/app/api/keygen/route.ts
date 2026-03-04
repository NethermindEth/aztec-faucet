import { NextResponse } from "next/server";
import { Fr } from "@aztec/aztec.js/fields";
import { getSchnorrAccountContractAddress } from "@aztec/accounts/schnorr";
import { Throttle, ThrottleError } from "@/lib/throttle";

// 10 keypair generations per hour per IP
const keygenThrottle = new Throttle(3_600_000, 10);

export async function GET(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || undefined;

  try {
    if (ip) keygenThrottle.check(ip, "keygen");

    const secret = Fr.random();
    const address = await getSchnorrAccountContractAddress(secret, Fr.ZERO);

    if (ip) keygenThrottle.record(ip, "keygen");

    return NextResponse.json({
      secretKey: secret.toString(),
      address: address.toString(),
    });
  } catch (err) {
    if (err instanceof ThrottleError) {
      return NextResponse.json(
        { error: "Too many keypair requests. Please try again later." },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
