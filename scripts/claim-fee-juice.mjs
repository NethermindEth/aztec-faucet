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

// ── progress spinner ─────────────────────────────────────────────────────────
const _F = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const _C = { cy:'\x1b[36m', gr:'\x1b[32m', rd:'\x1b[31m', di:'\x1b[2m', rs:'\x1b[0m' };
let _sp = null;
function spin(label) {
  let i = 0, t, s = Date.now();
  t = setInterval(() => {
    const e = Math.floor((Date.now() - s) / 1000);
    process.stdout.write(`\r  ${_C.cy}${_F[i++ % 10]}${_C.rs}  ${label}  ${_C.di}${e}s${_C.rs}`);
  }, 80);
  return (_sp = {
    ok(note = '') {
      clearInterval(t); _sp = null;
      const d = ((Date.now() - s) / 1000).toFixed(1);
      const n = note ? `  ${_C.di}${note}${_C.rs}` : '';
      process.stdout.write(`\r\x1b[K  ${_C.gr}✓${_C.rs}  ${label}${n}  ${_C.di}${d}s${_C.rs}\n`);
    },
    fail(note = '') {
      clearInterval(t); _sp = null;
      const n = note ? `  ${_C.di}${note}${_C.rs}` : '';
      process.stdout.write(`\r\x1b[K  ${_C.rd}✗${_C.rs}  ${label}${n}\n`);
    },
  });
}
// OSC 8 hyperlink with explicit underline + cyan so it looks clickable even
// in terminals that don't render OSC 8 hover effects (e.g. macOS Terminal.app).
// Cmd+click (Terminal.app) or click (iTerm2/Ghostty/Warp) opens the URL.
const link = (url, text = url) =>
  `\x1b]8;;${url}\x1b\\\x1b[4;36m${text}\x1b[0m\x1b]8;;\x1b\\`;
// ─────────────────────────────────────────────────────────────────────────────

// Format a raw Fee Juice bigint (18 decimals) as "x.xxxx FJ"
function formatFJ(raw) {
  try {
    const s = BigInt(raw).toString().padStart(19, "0");
    return `${s.slice(0, s.length - 18) || "0"}.${s.slice(s.length - 18, s.length - 14)} FJ`;
  } catch { return raw ?? "n/a"; }
}

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
const { AztecAddress } = await import(`${SDK}/aztec.js/addresses`);
const { createAztecNodeClient } = await import(`${SDK}/aztec.js/node`);
const { FeeJuicePaymentMethodWithClaim } = await import(`${SDK}/aztec.js/fee`);
const { GasSettings } = await import(`${SDK}/stdlib/gas`);
const { EmbeddedWallet } = await import(`${SDK}/wallets/embedded`);

// For testnet, @aztec-rc/wallets and @aztec-rc/aztec.js each bundle a separate copy of
// @aztec/foundation. EmbeddedWallet's AccountManager does `new Fr(salt)` using the wallets-
// internal Fr class; passing an Fr object from @aztec-rc/aztec.js fails instanceof checks.
// Fix: import Fr from the wallets package's own nested @aztec/aztec.js so class instances match.
let Fr;
if (network === "testnet") {
  const { createRequire } = await import("module");
  const { existsSync } = await import("fs");
  const _req = createRequire(import.meta.url);
  // Wallets entry path: .../node_modules/@aztec-rc/wallets/dest/embedded/entrypoints/node.js
  // Its nested aztec.js lives at: .../node_modules/@aztec-rc/wallets/node_modules/@aztec/aztec.js/
  const walletsEntry = _req.resolve(`${SDK}/wallets/embedded`);
  const walletsRoot = walletsEntry.slice(0, walletsEntry.indexOf("/node_modules/@aztec-rc/wallets/") +
    "/node_modules/@aztec-rc/wallets/".length);
  // Use absolute path import to bypass package exports restrictions
  const internalFieldsPath = walletsRoot + "node_modules/@aztec/aztec.js/dest/api/fields.js";
  // If npm deduplicated the package (no nested copy), fall back to the root-level alias.
  // Deduplication means all @aztec/aztec.js imports share one module instance, so instanceof works.
  if (existsSync(internalFieldsPath)) {
    ({ Fr } = await import(internalFieldsPath));
  } else {
    ({ Fr } = await import(`${SDK}/aztec.js/fields`));
  }
} else {
  ({ Fr } = await import(`${SDK}/aztec.js/fields`));
}

console.log(`
  Aztec Fee Juice Claim  ·  ${network}
  ${_C.di}node${_C.rs}    ${nodeUrl}
  ${_C.di}amount${_C.rs}  ${claimAmountStr}
  ${_C.di}leaf${_C.rs}    ${messageLeafIndexStr}
`);

try {
  // Step 1: Create wallet and derive account
  const s1 = spin('Initializing wallet');
  const wallet = await EmbeddedWallet.create(nodeUrl, {
    ephemeral: true,
    pxeConfig: { proverEnabled: true },
  });
  const secretKey = Fr.fromHexString(accountSecret);
  const accountManager = await wallet.createSchnorrAccount(secretKey, Fr.ZERO);
  const address = accountManager.address;
  s1.ok(address.toString().slice(0, 20) + '…');

  // Step 2: Check deployment status
  const s2 = spin('Checking account status');
  const metadata = await wallet.getContractMetadata(address);
  const isDeployed = metadata.isContractInitialized;
  s2.ok(isDeployed ? 'deployed' : 'not yet deployed');

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
    // Deploy + claim in one tx.
    // wait: { returnReceipt: true } is required — without it DeployMethod.send()
    // returns the deployed contract instance, not the TxReceipt.
    const s3 = spin('Deploying account and claiming Fee Juice');
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, claim);
    const deployMethod = await accountManager.getDeployMethod();

    const raw = await deployMethod.send({
      from: AztecAddress.ZERO,
      fee: { gasSettings, paymentMethod },
      wait: { returnReceipt: true },
    });
    // devnet @devnet: receipt fields at top level
    // testnet @rc: receipt nested under raw.receipt
    const receipt = raw?.receipt ?? raw;

    const txHash = receipt?.txHash?.toString?.() ?? "n/a";
    const statusStr = receipt?.status ?? "unknown";
    s3.ok(statusStr);

    const explorerUrl = `${EXPLORER_TX_URLS[network]}/${txHash}`;
    const statusClr = ['checkpointed','success','mined'].includes(statusStr) ? _C.gr : '';
    console.log(`
  ${_C.di}tx${_C.rs}      ${txHash}
  ${_C.di}status${_C.rs}  ${statusClr}${statusStr}${_C.rs}
  ${_C.di}block${_C.rs}   ${receipt?.blockNumber ?? "n/a"}
  ${_C.di}fee${_C.rs}     ${formatFJ(receipt?.transactionFee?.toString())}
`);
    if (txHash !== "n/a") console.log(`  ${_C.di}explorer${_C.rs}  ${link(explorerUrl)}\n`);
  } else {
    // Claim directly on already-deployed account
    const s3 = spin('Claiming Fee Juice');
    const { FeeJuiceContract } = await import(`${SDK}/aztec.js/protocol`);

    // FeeJuiceContract.at() takes only the wallet — protocol address is hardcoded
    const feeJuice = FeeJuiceContract.at(wallet);
    const raw = await feeJuice.methods
      .claim(address, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
      .send({ from: address, fee: { gasSettings } });
    const receipt = raw?.receipt ?? raw;

    const txHash = receipt?.txHash?.toString?.() ?? "n/a";
    const statusStr = receipt?.status ?? "unknown";
    s3.ok(statusStr);

    const explorerUrl = `${EXPLORER_TX_URLS[network]}/${txHash}`;
    const statusClr = ['checkpointed','success','mined'].includes(statusStr) ? _C.gr : '';
    console.log(`
  ${_C.di}tx${_C.rs}      ${txHash}
  ${_C.di}status${_C.rs}  ${statusClr}${statusStr}${_C.rs}
  ${_C.di}block${_C.rs}   ${receipt?.blockNumber ?? "n/a"}
  ${_C.di}fee${_C.rs}     ${formatFJ(receipt?.transactionFee?.toString())}
`);
    if (txHash !== "n/a") console.log(`  ${_C.di}explorer${_C.rs}  ${link(explorerUrl)}\n`);
  }

  console.log(`  ${_C.di}check balance${_C.rs}\n  curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/${network}/check-balance.sh | sh -s -- --address ${address.toString()}\n`);

  await wallet.stop();
  process.exit(0);
} catch (err) {
  if (_sp) _sp.fail();

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
