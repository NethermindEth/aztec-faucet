import { NextResponse } from "next/server";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { getSchnorrAccountContractAddress, SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { deriveKeys, deriveSigningKey } from "@aztec/stdlib/keys";
import { computeInitializationHash, computeContractAddressFromInstance } from "@aztec/stdlib/contract";
import { Throttle, ThrottleError } from "@/lib/throttle";
import { TESTNET_SCHNORR_CLASS_ID } from "@/lib/network-config";

/**
 * Computes the Schnorr account address for the testnet (@rc SDK).
 * The testnet uses a different contract bytecode from devnet, giving a different class ID.
 * Both SDKs compute the SAME initializationHash for the same secret (same constructor signature),
 * so we reuse @devnet SDK primitives and just swap in the @rc class ID.
 */
async function getTestnetSchnorrAddress(secret: Fr): Promise<AztecAddress> {
  const signingKey = deriveSigningKey(secret);
  const { publicKeys } = await deriveKeys(secret);
  const contract = new SchnorrAccountContract(signingKey);
  const artifact = await contract.getContractArtifact();
  const initFn = await contract.getInitializationFunctionAndArgs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constructorArtifact = (artifact as any).functions.find((f: any) => f.name === initFn.constructorName);
  const initHash = await computeInitializationHash(constructorArtifact, initFn.constructorArgs);

  const classId = Fr.fromHexString(TESTNET_SCHNORR_CLASS_ID);
  const instance = {
    currentContractClassId: classId,
    originalContractClassId: classId,
    initializationHash: initHash,
    publicKeys,
    salt: Fr.ZERO,
    deployer: AztecAddress.ZERO,
    version: 1 as const,
  };
  return computeContractAddressFromInstance(instance);
}

// 10 keypair generations per 24 hours per IP
const keygenThrottle = new Throttle(86_400_000, 10);

export async function GET(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || undefined;

  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") === "testnet" ? "testnet" : "devnet";

  try {
    if (ip) keygenThrottle.check(ip, "keygen");

    const secret = Fr.random();

    const address = network === "testnet"
      ? await getTestnetSchnorrAddress(secret)
      : await getSchnorrAccountContractAddress(secret, Fr.ZERO);

    if (ip) keygenThrottle.record(ip, "keygen");

    return NextResponse.json({
      secretKey: secret.toString(),
      address: address.toString(),
    });
  } catch (err) {
    if (err instanceof ThrottleError) {
      return NextResponse.json(
        { error: "Too many keypair requests. You can generate up to 10 keypairs per 24 hours. Please try again later." },
        { status: 429 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
