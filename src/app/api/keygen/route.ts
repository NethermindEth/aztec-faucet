import { NextResponse } from "next/server";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { deriveKeys, deriveSigningKey } from "@aztec/stdlib/keys";
import { computeInitializationHash, computeContractAddressFromInstance } from "@aztec/stdlib/contract";
import { Throttle, ThrottleError } from "@/lib/throttle";
import { SCHNORR_CLASS_ID, KEYGEN_INTERVAL_MS, KEYGEN_MAX_PER_IP } from "@/lib/network-config";
import { CORS_HEADERS_GET } from "@/lib/cors";
import { extractClientIp } from "@/lib/client-ip";

/**
 * Computes the Schnorr account address using the testnet class ID.
 */
async function getSchnorrAddress(secret: Fr): Promise<AztecAddress> {
  const signingKey = deriveSigningKey(secret);
  const { publicKeys } = await deriveKeys(secret);
  const contract = new SchnorrAccountContract(signingKey);
  const artifact = await contract.getContractArtifact();
  const initFn = await contract.getInitializationFunctionAndArgs();
  // ContractArtifact.functions is FunctionArtifact[] — typed find, no cast needed.
  const constructorArtifact = artifact.functions.find((f) => f.name === initFn.constructorName);
  if (!constructorArtifact) {
    throw new Error(`SchnorrAccount artifact missing initializer "${initFn.constructorName}"`);
  }
  const initHash = await computeInitializationHash(constructorArtifact, initFn.constructorArgs);

  const classId = Fr.fromHexString(SCHNORR_CLASS_ID);
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
