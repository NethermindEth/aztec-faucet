import { NextResponse } from "next/server";
import { FaucetManager } from "@/lib/faucet-manager";
import { CLAIM_EXPIRY_MS } from "@/lib/claim-store";

function buildSdkSnippet(claimData: {
  claimAmount: string;
  claimSecretHex: string;
  messageLeafIndex: string;
}): string {
  return `import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { FeeJuiceContract } from "@aztec/aztec.js/protocol";
import { Fr } from "@aztec/aztec.js/fields";

const claim = {
  claimAmount: ${claimData.claimAmount}n,
  claimSecret: Fr.fromHexString("${claimData.claimSecretHex}"),
  messageLeafIndex: ${claimData.messageLeafIndex}n,
};

// Option 1: Account NOT yet deployed — deploy + claim in one tx
const paymentMethod = new FeeJuicePaymentMethodWithClaim(accountAddress, claim);
await deployMethod.send({ fee: { paymentMethod } });

// Option 2: Account ALREADY deployed — claim directly
const feeJuice = FeeJuiceContract.at(wallet);
await feeJuice.methods
  .claim(accountAddress, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
  .send({ from: accountAddress, fee: { gasSettings } });`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const messageHash = searchParams.get("messageHash");

  const network = searchParams.get("network") === "testnet" ? "testnet" : "devnet";
  const manager = FaucetManager.getInstance(network as "devnet" | "testnet");
  const claim = manager.getClaim(id);

  if (!claim) {
    // Stateless fallback: if the client provides messageHash, check the L2 node
    // directly. This handles multi-instance deployments where the drip and poll
    // requests land on different server pods.
    if (messageHash) {
      try {
        const { getNodeUrl } = await import("@/lib/network-config");
        const aztecNodeUrl = getNodeUrl(network as "devnet" | "testnet");
        if (aztecNodeUrl) {
          const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
          const { Fr } = await import("@aztec/aztec.js/fields");
          const node = createAztecNodeClient(aztecNodeUrl);
          const witness = await node.getL1ToL2MessageMembershipWitness(
            "latest",
            Fr.fromHexString(messageHash),
          );
          if (witness !== undefined) {
            return NextResponse.json({
              status: "ready",
              elapsedSeconds: 0,
              expiresInSeconds: Math.floor(CLAIM_EXPIRY_MS / 1000),
            });
          }
          return NextResponse.json({ status: "bridging", elapsedSeconds: 0 });
        }
      } catch (err) {
        console.error("[claim] Stateless fallback failed:", err);
      }
    }
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  const elapsed = Math.floor((Date.now() - claim.createdAt) / 1000);

  switch (claim.status) {
    case "bridging":
      return NextResponse.json({
        status: "bridging",
        elapsedSeconds: elapsed,
      });

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
      });

    case "expired":
      return NextResponse.json({
        status: "expired",
        elapsedSeconds: elapsed,
      });
  }
}
