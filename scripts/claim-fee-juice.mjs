/**
 * Claims bridged Fee Juice on L2.
 *
 * - If account is NOT deployed: deploys it with FeeJuicePaymentMethodWithClaim
 *   (claims Fee Juice AND uses it to pay for the deploy tx in one shot)
 * - If account IS deployed: calls FeeJuice.claim() directly and pays with
 *   existing Fee Juice balance
 *
 * Usage:
 *   node scripts/claim-fee-juice.mjs \
 *     --secret <account-secret-key> \
 *     --claim-amount <amount> \
 *     --claim-secret <secret-from-bridge> \
 *     --message-leaf-index <index>
 */
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { GasSettings } from "@aztec/stdlib/gas";

// Suppress all SDK logs — only our own output is shown
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";

const { EmbeddedWallet } = await import("@aztec/wallets/embedded");

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function die(msg) {
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}

const accountSecret = getArg("secret");
const claimAmountStr = getArg("claim-amount");
const claimSecretStr = getArg("claim-secret");
const messageLeafIndexStr = getArg("message-leaf-index");

if (!accountSecret || !claimAmountStr || !claimSecretStr || !messageLeafIndexStr) {
  console.log(`
  Usage: node scripts/claim-fee-juice.mjs \\
    --secret <account-secret-key> \\
    --claim-amount <amount> \\
    --claim-secret <secret-from-bridge> \\
    --message-leaf-index <index>

  All arguments are required. These values come from the faucet's Fee Juice drip response.
`);
  process.exit(1);
}

const nodeUrl = process.env.AZTEC_NODE_URL || "https://v4-devnet-2.aztec-labs.com/";

console.log(`
  Aztec Fee Juice Claim
  ---------------------
  Node:         ${nodeUrl}
  Claim Amount: ${claimAmountStr}
  Leaf Index:   ${messageLeafIndexStr}
`);

try {
  // Step 1: Create wallet and derive account
  process.stdout.write("  [1/3] Initializing wallet and account...");
  const wallet = await EmbeddedWallet.create(nodeUrl, {
    ephemeral: true,
    pxeConfig: { proverEnabled: true },
  });
  const secretKey = Fr.fromHexString(accountSecret);
  const accountManager = await wallet.createSchnorrAccount(secretKey, Fr.ZERO);
  const address = accountManager.address;
  console.log(" done");
  console.log(`        Address: ${address.toString()}`);

  // Step 2: Check deployment status
  process.stdout.write("  [2/3] Checking account status...");
  const metadata = await wallet.getContractMetadata(address);
  const isDeployed = metadata.isContractInitialized;
  console.log(isDeployed ? " deployed" : " not deployed");

  // Prepare claim and gas settings
  const claim = {
    claimAmount: BigInt(claimAmountStr),
    claimSecret: Fr.fromHexString(claimSecretStr),
    messageLeafIndex: BigInt(messageLeafIndexStr),
  };

  const node = createAztecNodeClient(nodeUrl);
  const currentMinFees = await node.getCurrentMinFees();
  const maxFeesPerGas = currentMinFees.mul(2);
  const gasSettings = GasSettings.default({ maxFeesPerGas });

  if (!isDeployed) {
    // Deploy + claim in one tx
    process.stdout.write("  [3/3] Deploying account + claiming Fee Juice (proving ~10s)...");
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, claim);
    const deployMethod = await accountManager.getDeployMethod();

    const result = await deployMethod.send({
      from: AztecAddress.ZERO,
      fee: { gasSettings, paymentMethod },
      wait: { returnReceipt: true },
    });

    console.log(" done\n");
    console.log("  Result");
    console.log("  ------");
    console.log(`  Tx Hash: ${result.txHash?.toString() ?? "n/a"}`);
    console.log(`  Status:  ${result.status ?? "unknown"}`);
    console.log(`  Block:   ${result.blockNumber ?? "n/a"}`);
    console.log(`  Fee:     ${result.transactionFee?.toString() ?? "n/a"}`);
    console.log(`\n  Account deployed and Fee Juice claimed successfully.`);
  } else {
    // Claim directly on already-deployed account
    process.stdout.write("  [3/3] Claiming Fee Juice (proving ~10s)...");
    const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");

    // FeeJuiceContract.at() takes only the wallet — protocol address is hardcoded
    const feeJuice = FeeJuiceContract.at(wallet);
    const receipt = await feeJuice.methods
      .claim(address, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
      .send({ from: address, fee: { gasSettings } });

    console.log(" done\n");
    console.log("  Result");
    console.log("  ------");
    console.log(`  Tx Hash: ${receipt.txHash?.toString() ?? "n/a"}`);
    console.log(`  Status:  ${receipt.status ?? "unknown"}`);
    console.log(`  Block:   ${receipt.blockNumber ?? "n/a"}`);
    console.log(`  Fee:     ${receipt.transactionFee?.toString() ?? "n/a"}`);
    console.log(`\n  Fee Juice claimed successfully.`);
  }

  console.log(`\n  Check balance:\n    curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- --address ${address.toString()}\n`);

  await wallet.stop();
  process.exit(0);
} catch (err) {
  console.log(" failed\n");

  const msg = err.message || String(err);

  if (msg.includes("No L1 to L2 message found")) {
    die(
      "No matching L1 to L2 message found on the node.\n" +
      "         Possible causes:\n" +
      "           - Your secret key does not match the address you dripped to\n" +
      "           - The bridge is not ready yet — wait ~2 minutes and try again\n" +
      "           - The claim values (amount, secret, leaf index) are incorrect"
    );
  }

  if (msg.includes("No non-nullified L1 to L2 message")) {
    die(
      "This claim has already been consumed.\n" +
      "         Request new Fee Juice from the faucet to get a fresh claim."
    );
  }

  if (msg.includes("Balance too low") || msg.includes("not enough balance")) {
    die("Insufficient Fee Juice balance to pay for this transaction's gas.");
  }

  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    die(`Cannot connect to Aztec node at ${nodeUrl}.\n         Check AZTEC_NODE_URL or ensure the node is running.`);
  }

  die(msg);
}
