/**
 * Claims bridged Fee Juice on Aztec testnet L2.
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
 *     [--node-url <url>]
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
    [--node-url <url>]

  All arguments except --node-url are required.
  These values come from the faucet's Fee Juice drip response.
`);
  process.exit(1);
}

// Reject any non-testnet --network value. The faucet is testnet-only.
if (networkArg !== undefined && networkArg !== "testnet") {
  die(`Unknown --network value "${networkArg}". Only "testnet" is supported.`);
}

const TESTNET_NODE_URL = "https://rpc.testnet.aztec-labs.com";
const TESTNET_EXPLORER_TX_URL = "https://testnet.aztecscan.xyz/tx-effects";

const network = "testnet";
const nodeUrl = getArg("node-url") || process.env.AZTEC_NODE_URL || TESTNET_NODE_URL;

// Testnet packages are installed under @aztec-rc/* aliases by sh/testnet/claim.sh.
const SDK = "@aztec-rc";
const { FeeJuicePaymentMethodWithClaim } = await import(`${SDK}/aztec.js/fee`);
const { NO_FROM } = await import(`${SDK}/aztec.js/account`);
const { EmbeddedWallet } = await import(`${SDK}/wallets/embedded`);

// @aztec-rc/wallets and @aztec-rc/aztec.js each bundle a separate copy of
// @aztec/foundation. EmbeddedWallet's AccountManager does `new Fr(salt)` using
// the wallets-internal Fr class; passing an Fr from @aztec-rc/aztec.js fails
// instanceof checks. Resolve Fr from the wallets package's own nested
// @aztec/aztec.js so class instances match.
let Fr;
{
  const { createRequire } = await import("module");
  const { existsSync } = await import("fs");
  const _req = createRequire(import.meta.url);
  // Wallets entry: .../node_modules/@aztec-rc/wallets/dest/embedded/entrypoints/node.js
  // Nested aztec.js: .../node_modules/@aztec-rc/wallets/node_modules/@aztec/aztec.js/
  const walletsEntry = _req.resolve(`${SDK}/wallets/embedded`);
  const walletsRoot = walletsEntry.slice(0, walletsEntry.indexOf("/node_modules/@aztec-rc/wallets/") +
    "/node_modules/@aztec-rc/wallets/".length);
  // Absolute path import bypasses package exports restrictions.
  const internalFieldsPath = walletsRoot + "node_modules/@aztec/aztec.js/dest/api/fields.js";
  // If npm deduplicated, fall back to the root-level alias.
  if (existsSync(internalFieldsPath)) {
    ({ Fr } = await import(internalFieldsPath));
  } else {
    ({ Fr } = await import(`${SDK}/aztec.js/fields`));
  }
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

  // Prepare claim. Per Aztec team: don't pass gasSettings — let the SDK
  // simulate before send and derive gas automatically. GasSettings.default
  // was removed in 4.2.0-rc.1 anyway.
  const claim = {
    claimAmount: BigInt(claimAmountStr),
    claimSecret: Fr.fromHexString(claimSecretStr),
    messageLeafIndex: BigInt(messageLeafIndexStr),
  };

  if (!isDeployed) {
    // Deploy + claim in one tx.
    // wait: { returnReceipt: true } is required — without it DeployMethod.send()
    // returns the deployed contract instance, not the TxReceipt.
    // 4.2.0 change: pass `from: NO_FROM` for self-deployments. The DeployAccountMethod
    // wraps the payload through the multicall entrypoint when `from === NO_FROM`,
    // letting the wallet execute it directly without an existing entrypoint.
    // Using AztecAddress.ZERO or the address itself fails with "Account 0x... does not exist"
    // or "Failed to get a note".
    const s3 = spin('Deploying account and claiming Fee Juice');
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, claim);
    const deployMethod = await accountManager.getDeployMethod();

    const raw = await deployMethod.send({
      from: NO_FROM,
      fee: { paymentMethod },
      wait: { returnReceipt: true },
    });
    // testnet @rc: receipt is nested under raw.receipt; older shapes left it
    // at the top level. Tolerate both.
    const receipt = raw?.receipt ?? raw;

    const txHash = receipt?.txHash?.toString?.() ?? "n/a";
    const statusStr = receipt?.status ?? "unknown";
    s3.ok(statusStr);

    const explorerUrl = `${TESTNET_EXPLORER_TX_URL}/${txHash}`;
    const statusClr = ['checkpointed','success','mined'].includes(statusStr) ? _C.gr : '';
    console.log(`
  ${_C.di}tx${_C.rs}      ${txHash}
  ${_C.di}status${_C.rs}  ${statusClr}${statusStr}${_C.rs}
  ${_C.di}block${_C.rs}   ${receipt?.blockNumber ?? "n/a"}
  ${_C.di}fee${_C.rs}     ${formatFJ(receipt?.transactionFee?.toString())}
`);
    if (txHash !== "n/a") console.log(`  ${_C.di}explorer${_C.rs}  ${link(explorerUrl)}\n`);
  } else {
    // Claim on already-deployed account.
    // FeeJuicePaymentMethodWithClaim internally calls claim_and_end_setup() in the
    // non-revertible setup phase, so we must NOT also call FeeJuice.claim() (that would
    // double-consume the L1→L2 message = duplicate nullifier error).
    // Instead, send check_balance(0n) as a noop — same pattern used in Aztec's own
    // e2e tests (fee_juice_payments.test.ts). The payment method handles the actual claim.
    const s3 = spin('Claiming Fee Juice');
    const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, claim);
    const { FeeJuiceContract } = await import(`${SDK}/aztec.js/protocol`);

    const feeJuice = FeeJuiceContract.at(wallet);
    const raw = await feeJuice.methods
      .check_balance(0n)
      .send({ from: address, fee: { paymentMethod } });
    const receipt = raw?.receipt ?? raw;

    const txHash = receipt?.txHash?.toString?.() ?? "n/a";
    const statusStr = receipt?.status ?? "unknown";
    s3.ok(statusStr);

    const explorerUrl = `${TESTNET_EXPLORER_TX_URL}/${txHash}`;
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
