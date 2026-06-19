import { NextResponse } from "next/server";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { deriveKeys, deriveSigningKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { Throttle, ThrottleError } from "@/lib/throttle";
import { SCHNORR_CLASS_ID, KEYGEN_INTERVAL_MS, KEYGEN_MAX_PER_IP } from "@/lib/network-config";
import { CORS_HEADERS_GET } from "@/lib/cors";
import { extractClientIp } from "@/lib/client-ip";

/**
 * Computes the Schnorr account address the same way the wallet does, so the
 * faucet hands back the address the user's CLI/Azguard wallet will derive from
 * the same secret. v5 folds immutablesHash into the address, so we use the SDK
 * instance helper rather than hand-building the struct. SCHNORR_CLASS_ID is a
 * tripwire: if the artifact's class id drifts from the pinned testnet value,
 * fail loudly instead of minting unreachable addresses.
 */
async function getSchnorrAddress(secret: Fr): Promise<AztecAddress> {
  const signingKey = deriveSigningKey(secret);
  const { publicKeys } = await deriveKeys(secret);
  const contract = new SchnorrAccountContract(signingKey);
  const artifact = await contract.getContractArtifact();
  const initFn = await contract.getInitializationFunctionAndArgs();

  const instance = await getContractInstanceFromInstantiationParams(artifact, {
    constructorArtifact: initFn?.constructorName,
    constructorArgs: initFn?.constructorArgs ?? [],
    salt: Fr.ZERO,
    publicKeys,
    deployer: AztecAddress.ZERO,
  });

  if (instance.originalContractClassId.toString() !== SCHNORR_CLASS_ID) {
    throw new Error(
      `Schnorr class id mismatch: artifact ${instance.originalContractClassId.toString()} != pinned ${SCHNORR_CLASS_ID}. SDK and testnet are out of sync.`,
    );
  }
  return instance.address;
}

const keygenThrottle = new Throttle(KEYGEN_INTERVAL_MS, KEYGEN_MAX_PER_IP);

export async function GET(request: Request) {
  const ip = extractClientIp(request);

  try {
    if (ip) keygenThrottle.check(ip, "keygen");

    const secret = Fr.random();
    const address = await getSchnorrAddress(secret);

    if (ip) keygenThrottle.record(ip, "keygen");

    return NextResponse.json({
      secretKey: secret.toString(),
      address: address.toString(),
    }, { headers: CORS_HEADERS_GET });
  } catch (err) {
    if (err instanceof ThrottleError) {
      return NextResponse.json(
        { error: "Too many keypair requests. You can generate up to 10 keypairs per 24 hours. Please try again later." },
        { status: 429, headers: CORS_HEADERS_GET },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg.slice(0, 200) },
      { status: 500, headers: CORS_HEADERS_GET },
    );
  }
}
