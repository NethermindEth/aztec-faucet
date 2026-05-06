import { NextResponse } from "next/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { FaucetManager } from "@/lib/faucet-manager";
import { CLAIM_EXPIRY_MS } from "@/lib/claim-store";
import { NODE_URL } from "@/lib/network-config";
import { CORS_HEADERS_GET } from "@/lib/cors";

function buildSdkSnippet(claimData: {
  claimAmount: string;
  claimSecretHex: string;
  messageLeafIndex: string;
}): string {
  // Note: in @aztec/aztec.js@4.2.0+, the wallet auto-fills gasSettings via
  // simulation. Don't pass `fee: { gasSettings }` — pass only `paymentMethod`
  // (or nothing at all if the account has existing FJ balance).
  return `import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { FeeJuiceContract } from "@aztec/aztec.js/protocol";
import { NO_FROM } from "@aztec/aztec.js/account";
import { Fr } from "@aztec/aztec.js/fields";

const claim = {
  claimAmount: ${claimData.claimAmount}n,
  claimSecret: Fr.fromHexString("${claimData.claimSecretHex}"),
  messageLeafIndex: ${claimData.messageLeafIndex}n,
};

// Option 1: Account NOT yet deployed — deploy + claim atomically.
// Pass NO_FROM for self-deploys; the wallet wraps the payload through the
// multicall entrypoint so it can execute without an existing account.
const paymentMethod = new FeeJuicePaymentMethodWithClaim(accountAddress, claim);
await deployMethod.send({ from: NO_FROM, fee: { paymentMethod } });

// Option 2: Account ALREADY deployed — claim through the FeeJuice contract.
// The wallet auto-detects FEE_JUICE_WITH_CLAIM mode when from === feePayer
// and wraps claim_and_end_setup automatically.
const feeJuice = FeeJuiceContract.at(wallet);
await feeJuice.methods
  .claim(accountAddress, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
  .send({ from: accountAddress, fee: { paymentMethod } });`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const messageHash = searchParams.get("messageHash");

  const manager = FaucetManager.getInstance();
  const claim = manager.getClaim(id);

  if (!claim) {
    // Stateless fallback: if the client provides messageHash, check the L2 node
    // directly. This handles multi-instance deployments where the drip and poll
    // requests land on different server pods.
    if (messageHash) {
      try {
        const node = createAztecNodeClient(NODE_URL);
        const witness = await node.getL1ToL2MessageMembershipWitness(
          "latest",
          Fr.fromHexString(messageHash),
        );
        if (witness !== undefined) {
          return NextResponse.json({
            status: "ready",
            elapsedSeconds: 0,
            expiresInSeconds: Math.floor(CLAIM_EXPIRY_MS / 1000),
          }, { headers: CORS_HEADERS_GET });
        }
        return NextResponse.json(
          { status: "bridging", elapsedSeconds: 0 },
          { headers: CORS_HEADERS_GET },
        );
      } catch (err) {
        console.error("[claim] Stateless fallback failed:", err);
      }
    }
    return NextResponse.json(
      { error: "Claim not found" },
      { status: 404, headers: CORS_HEADERS_GET },
    );
  }

  const elapsed = Math.floor((Date.now() - claim.createdAt) / 1000);

  switch (claim.status) {
    case "bridging":
      return NextResponse.json({
        status: "bridging",
        elapsedSeconds: elapsed,
      }, { headers: CORS_HEADERS_GET });

    case "ready":
      return NextResponse.json({
        status: "ready",
        elapsedSeconds: elapsed,
        expiresInSeconds: Math.max(
          0,
          Math.floor((claim.createdAt + CLAIM_EXPIRY_MS - Date.now()) / 1000),
        ),
        claimData: claim.claimData,
        sdkSnippet: buildSdkSnippet(claim.claimData),
      }, { headers: CORS_HEADERS_GET });

    case "expired":
      return NextResponse.json({
        status: "expired",
        elapsedSeconds: elapsed,
      }, { headers: CORS_HEADERS_GET });
  }
}
