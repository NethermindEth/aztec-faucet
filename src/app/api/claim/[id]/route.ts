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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const manager = FaucetManager.getInstance();
  const claim = manager.getClaim(id);

  if (!claim) {
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
