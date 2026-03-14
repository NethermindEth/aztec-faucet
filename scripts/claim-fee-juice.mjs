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
 *     --message-leaf-index <index> \
 *     [--node-url <url>] \
 *     [--network testnet|devnet]
 */
// Suppress all SDK logs — only our own output is shown
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";

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
const networkArg = getArg("network");

if (!accountSecret || !claimAmountStr || !claimSecretStr || !messageLeafIndexStr) {
  console.log(`
  Usage: node scripts/claim-fee-juice.mjs \\
    --secret <account-secret-key> \\
    --claim-amount <amount> \\
    --claim-secret <secret-from-bridge> \\
    --message-leaf-index <index> \\
    [--node-url <url>] \\
    [--network testnet|devnet]

  All arguments except --node-url and --network are required.
  These values come from the faucet's Fee Juice drip response.
`);
  process.exit(1);
}

const DEFAULT_NODE_URLS = {
  testnet: "https://rpc.testnet.aztec-labs.com",
  devnet: "https://v4-devnet-2.aztec-labs.com/",
};
const EXPLORER_TX_URLS = {
  testnet: "https://testnet.aztecscan.xyz/tx-effects",
  devnet: "https://devnet.aztecscan.xyz/tx-effects",
};

const network = networkArg === "testnet" ? "testnet" : "devnet";
const nodeUrl = getArg("node-url") || process.env.AZTEC_NODE_URL || DEFAULT_NODE_URLS[network];

// Load the SDK version matching the network's VK tree.
// devnet node (4.0.0-devnet.*) and testnet node (4.1.0-rc.*) have incompatible
// verification keys, so the proof must be generated with the correct SDK.
const SDK = network === "testnet" ? "@aztec-rc" : "@aztec";
const { Fr } = await import(`${SDK}/aztec.js/fields`);
const { AztecAddress } = await import(`${SDK}/aztec.js/addresses`);
const { createAztecNodeClient } = await import(`${SDK}/aztec.js/node`);
const { FeeJuicePaymentMethodWithClaim } = await import(`${SDK}/aztec.js/fee`);
const { GasSettings } = await import(`${SDK}/stdlib/gas`);
const { EmbeddedWallet } = await import(`${SDK}/wallets/embedded`);

console.log(`
  Aztec Fee Juice Claim
  ---------------------
  Network:      ${network}
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

  // Normalize the return value from send() across SDK versions:
  // - @rc: send() returns TxReceipt directly (has .txHash)
  // - @devnet: send() returns SentTx; need to call .wait() to get receipt
  async function getReceipt(sentTx) {
    if (sentTx?.txHash) return sentTx;
    if (sentTx?.receipt?.txHash) return sentTx.receipt;
    if (typeof sentTx?.wait === "function") {
      try { return await sentTx.wait(); } catch { return sentTx?.receipt; }
    }
    return sentTx?.receipt;
  }

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
    });

    const receipt = await getReceipt(result);
    const txHash = receipt?.txHash?.toString() ?? "n/a";
    console.log(" done\n");
    console.log("  Result");
    console.log("  ------");
    console.log(`  Tx Hash: ${txHash}`);
    console.log(`  Status:  ${receipt?.status ?? "unknown"}`);
    console.log(`  Block:   ${receipt?.blockNumber ?? "n/a"}`);
    console.log(`  Fee:     ${receipt?.transactionFee?.toString() ?? "n/a"}`);
    if (txHash !== "n/a") console.log(`  Explorer: ${EXPLORER_TX_URLS[network]}/${txHash}`);
    console.log(`\n  Account deployed and Fee Juice claimed successfully.`);
  } else {
    // Claim directly on already-deployed account
    process.stdout.write("  [3/3] Claiming Fee Juice (proving ~10s)...");
    const { FeeJuiceContract } = await import(`${SDK}/aztec.js/protocol`);

    // FeeJuiceContract.at() takes only the wallet — protocol address is hardcoded
    const feeJuice = FeeJuiceContract.at(wallet);
    const result = await feeJuice.methods
      .claim(address, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
      .send({ from: address, fee: { gasSettings } });

    const receipt = await getReceipt(result);
    const txHash = receipt?.txHash?.toString() ?? "n/a";
    console.log(" done\n");
    console.log("  Result");
    console.log("  ------");
    console.log(`  Tx Hash: ${txHash}`);
    console.log(`  Status:  ${receipt?.status ?? "unknown"}`);
    console.log(`  Block:   ${receipt?.blockNumber ?? "n/a"}`);
    console.log(`  Fee:     ${receipt?.transactionFee?.toString() ?? "n/a"}`);
    if (txHash !== "n/a") console.log(`  Explorer: ${EXPLORER_TX_URLS[network]}/${txHash}`);
    console.log(`\n  Fee Juice claimed successfully.`);
  }

  console.log(`\n  Check balance:\n    curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- --address ${address.toString()} --network ${network}\n`);

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

  if (msg.includes("Nullifier conflict")) {
    die(
      "A transaction with these nullifiers is already pending on the node.\n" +
      "         Wait a few minutes for it to be mined, then check your balance.\n" +
      "         Do not retry — submitting again will fail."
    );
  }

  if (msg.includes("Balance too low") || msg.includes("not enough balance")) {
    die("Insufficient Fee Juice balance to pay for this transaction's gas.");
  }

  if (msg.includes("Incorrect verification keys tree root")) {
    die(
      "The node rejected the proof due to a verification key mismatch.\n" +
      "         The network was likely upgraded and requires a newer SDK version.\n" +
      "         Check https://docs.aztec.network for the latest compatible SDK tag."
    );
  }

  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    die(`Cannot connect to Aztec node at ${nodeUrl}.\n         Check --node-url or ensure the node is running.`);
  }

  die(msg);
}
