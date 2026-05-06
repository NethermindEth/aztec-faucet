/**
 * Creates a new Aztec account (or derives one from an existing secret key).
 *
 * Usage:
 *   node scripts/create-aztec-account.mjs
 *   node scripts/create-aztec-account.mjs --secret 0xYOUR_EXISTING_SECRET
 */

// Suppress all SDK logs
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

// Reject any --network value other than "testnet" — the project is testnet-only.
const networkArg = getArg("network");
if (networkArg !== undefined && networkArg !== "testnet") {
  console.error(`\n  Error: Unknown --network value "${networkArg}". Only "testnet" is supported.\n`);
  process.exit(1);
}

const TESTNET_NODE_URL = "https://rpc.testnet.aztec-labs.com";
const nodeUrl = getArg("node-url") || process.env.AZTEC_NODE_URL || TESTNET_NODE_URL;
const existingSecret = getArg("secret") ?? null;

// Testnet packages are installed under @aztec-rc/* aliases by sh/testnet/create-account.sh.
const SDK = "@aztec-rc";
const { EmbeddedWallet } = await import(`${SDK}/wallets/embedded`);

// Fr must come from the wallets-internal @aztec/foundation to pass instanceof
// checks inside EmbeddedWallet.createSchnorrAccount (same pattern as claim-fee-juice.mjs).
let Fr;
{
  const { createRequire } = await import("module");
  const { existsSync } = await import("fs");
  const _req = createRequire(import.meta.url);
  const walletsEntry = _req.resolve(`${SDK}/wallets/embedded`);
  const walletsRoot = walletsEntry.slice(
    0,
    walletsEntry.indexOf("/node_modules/@aztec-rc/wallets/") + "/node_modules/@aztec-rc/wallets/".length
  );
  const internalFieldsPath = walletsRoot + "node_modules/@aztec/aztec.js/dest/api/fields.js";
  // If npm deduplicated, fall back to the root-level alias.
  if (existsSync(internalFieldsPath)) {
    ({ Fr } = await import(internalFieldsPath));
  } else {
    ({ Fr } = await import(`${SDK}/aztec.js/fields`));
  }
}

console.log(`\n  Aztec Account Generator  ·  testnet\n`);

try {
  const s1 = spin('Connecting to node');
  const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });
  s1.ok(nodeUrl);

  const s2 = spin('Deriving account');
  const secretKey = existingSecret ? Fr.fromHexString(existingSecret) : Fr.random();
  const account = await wallet.createSchnorrAccount(secretKey, Fr.ZERO);
  s2.ok(account.address.toString().slice(0, 20) + '…');

  console.log(`
  ${_C.di}secret${_C.rs}   ${secretKey.toString()}
  ${_C.di}address${_C.rs}  ${account.address.toString()}

  ${_C.di}Next:${_C.rs} paste your address into the faucet, wait ~2 min for the bridge,
  then run the claim command shown in the faucet UI.
`);

  await wallet.stop();
  process.exit(0);
} catch (err) {
  if (_sp) _sp.fail();

  const msg = err.message || String(err);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(`\n  Error: Cannot connect to Aztec node at ${nodeUrl}.`);
    console.error("         Check AZTEC_NODE_URL or ensure the node is running.\n");
  } else {
    console.error(`\n  Error: ${msg}\n`);
  }

  process.exit(1);
}
