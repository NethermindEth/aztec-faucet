/**
 * Checks the L2 Fee Juice balance of an Aztec address.
 *
 * Usage:
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS --node https://...
 */
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
// ─────────────────────────────────────────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function formatFeeJuice(raw) {
  const str = raw.toString().padStart(19, "0");
  const intPart = str.slice(0, str.length - 18) || "0";
  const decPart = str.slice(str.length - 18, str.length - 14);
  return `${intPart}.${decPart}`;
}

const TESTNET_NODE_URL = "https://rpc.testnet.aztec-labs.com";

const address = getArg("address");
const networkArg = getArg("network");
if (networkArg !== undefined && networkArg !== "testnet") {
  console.error(`\n  Error: Unknown --network value "${networkArg}". Only "testnet" is supported.\n`);
  process.exit(1);
}
const nodeUrl = getArg("node") || process.env.AZTEC_NODE_URL || TESTNET_NODE_URL;

// Testnet packages are installed under @aztec-rc/* aliases by sh/testnet/check-balance.sh.
const SDK = "@aztec-rc";
const { createAztecNodeClient } = await import(`${SDK}/aztec.js/node`);
const { AztecAddress } = await import(`${SDK}/aztec.js/addresses`);
const { Fr } = await import(`${SDK}/aztec.js/fields`);
const { deriveStorageSlotInMap } = await import(`${SDK}/stdlib/hash`);

if (!address) {
  console.log(`
  Usage: node scripts/check-fee-juice-balance.mjs --address <aztec-address>

  Options:
    --address   Aztec address (required, 0x + 64 hex chars)
    --node      Aztec node URL (default: ${TESTNET_NODE_URL})
`);
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
  console.error("\n  Error: Invalid Aztec address. Expected 0x + 64 hex characters.\n");
  process.exit(1);
}

console.log(`\n  Aztec Fee Juice Balance  ·  testnet\n`);

try {
  const sp = spin('Fetching balance');

  const node = createAztecNodeClient(nodeUrl);
  const owner = AztecAddress.fromString(address);

  // Fee Juice contract at protocol address 0x05, balances in map at slot 1
  const feeJuiceAddress = AztecAddress.fromBigInt(5n);
  const balanceSlot = await deriveStorageSlotInMap(new Fr(1), owner);
  const balanceField = await node.getPublicStorageAt("latest", feeJuiceAddress, balanceSlot);
  const balance = balanceField.toBigInt();

  const balanceFormatted = `${formatFeeJuice(balance)} Fee Juice`;
  sp.ok(balanceFormatted);

  console.log(`
  ${_C.di}address${_C.rs}  ${address}
  ${_C.di}node${_C.rs}     ${nodeUrl}
  ${_C.di}balance${_C.rs}  ${_C.gr}${balanceFormatted}${_C.rs}
`);

  if (balance === 0n) {
    console.log(`  No balance found. Possible reasons:
    - Haven't requested Fee Juice from the faucet yet
    - L1→L2 bridge is still pending (~2 minutes)
    - Haven't claimed yet (run the claim command from the faucet UI)
    - Fee Juice was already spent on transactions
`);
  }
} catch (err) {
  if (_sp) _sp.fail();

  const msg = err.message || String(err);

  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(`\n  Error: Cannot connect to Aztec node at ${nodeUrl}.\n`);
  } else {
    console.error(`\n  Error: ${msg}\n`);
  }

  process.exit(1);
}
