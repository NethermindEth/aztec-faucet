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
// Rounded box: rows = [label, display_value, raw_value_without_ansi?]
function box(rows) {
  const PAD = 2, GAP = 2;
  const lW = Math.max(...rows.map(r => r[0].length));
  const vW = Math.max(...rows.map(r => (r[2] !== undefined ? r[2] : r[1]).length));
  const iW = PAD + lW + GAP + vW + PAD;
  const hr = '─'.repeat(iW);
  return [
    `  ╭${hr}╮`,
    ...rows.map(([l, v, raw]) => {
      const trail = ' '.repeat(vW - (raw !== undefined ? raw.length : v.length) + PAD);
      return `  │${' '.repeat(PAD)}${_C.di}${l.padEnd(lW)}${_C.rs}${' '.repeat(GAP)}${v}${trail}│`;
    }),
    `  ╰${hr}╯`,
  ].join('\n');
}
// ─────────────────────────────────────────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const DEFAULT_NODE_URLS = {
  testnet: "https://rpc.testnet.aztec-labs.com",
  devnet: "https://v4-devnet-2.aztec-labs.com/",
};

const network = getArg("network") === "testnet" ? "testnet" : "devnet";
const nodeUrl = getArg("node-url") || process.env.AZTEC_NODE_URL || DEFAULT_NODE_URLS[network];
const existingSecret = getArg("secret") ?? null;

// Load SDK matching the network — devnet uses @aztec/*, testnet uses @aztec-rc/*
const SDK = network === "testnet" ? "@aztec-rc" : "@aztec";
const { EmbeddedWallet } = await import(`${SDK}/wallets/embedded`);

// For testnet, Fr must come from the wallets-internal @aztec/foundation to pass
// instanceof checks inside EmbeddedWallet.createSchnorrAccount (same pattern as claim-fee-juice.mjs)
let Fr;
if (network === "testnet") {
  const { createRequire } = await import("module");
  const _req = createRequire(import.meta.url);
  const walletsEntry = _req.resolve(`${SDK}/wallets/embedded`);
  const walletsRoot = walletsEntry.slice(
    0,
    walletsEntry.indexOf("/node_modules/@aztec-rc/wallets/") + "/node_modules/@aztec-rc/wallets/".length
  );
  const internalFieldsPath = walletsRoot + "node_modules/@aztec/aztec.js/dest/api/fields.js";
  ({ Fr } = await import(internalFieldsPath));
} else {
  ({ Fr } = await import(`${SDK}/aztec.js/fields`));
}

console.log(`\n  Aztec Account Generator  ·  ${network}\n`);

try {
  const s1 = spin('Connecting to node');
  const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });
  s1.ok(nodeUrl);

  const s2 = spin('Deriving account');
  const secretKey = existingSecret ? Fr.fromHexString(existingSecret) : Fr.random();
  const account = await wallet.createSchnorrAccount(secretKey, Fr.ZERO);
  s2.ok(account.address.toString().slice(0, 20) + '…');

  console.log('\n' + box([
    ['secret',  secretKey.toString()],
    ['address', account.address.toString()],
  ]) + '\n');
  console.log(`  ${_C.di}Next:${_C.rs} paste your address into the faucet, wait ~2 min for the bridge,\n  then run the claim command shown in the faucet UI.\n`);

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
