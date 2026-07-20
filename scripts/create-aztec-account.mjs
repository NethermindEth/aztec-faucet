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

const existingSecret = getArg("secret") ?? null;

// Testnet packages are installed under @aztec-rc/* aliases by sh/testnet/create-account.sh.
const SDK = "@aztec-rc";
const { Fr } = await import(`${SDK}/aztec.js/fields`);
const { AztecAddress } = await import(`${SDK}/aztec.js/addresses`);
const { SchnorrAccountContract } = await import(`${SDK}/accounts/schnorr`);
const { deriveKeys, deriveMasterMessageSigningSecretKey } = await import(`${SDK}/stdlib/keys`);
const { getContractInstanceFromInstantiationParams } = await import(`${SDK}/stdlib/contract`);

// Mirrors SCHNORR_CLASS_ID in src/lib/network-config.ts; re-verify on SDK bumps.
// Derivation is local (no node), so guard against artifact/network drift.
const SCHNORR_CLASS_ID = "0x0db539838feacc4420c8e33b01ffe733a8bae58bba2c403653691b1ed8d3d0c5";

// Derives the Schnorr account address locally, the same way the faucet keygen
// route does; showing the address needs no node connection.
async function deriveSchnorrAddress(secret) {
  const signingKey = deriveMasterMessageSigningSecretKey(secret);
  const { publicKeys } = await deriveKeys(secret);
  const contract = new SchnorrAccountContract(signingKey);
  const artifact = await contract.getContractArtifact();
  const initFn = await contract.getInitializationFunctionAndArgs();
  const instance = await getContractInstanceFromInstantiationParams(artifact, {
    constructorArtifact: initFn?.constructorName,
    constructorArgs: initFn?.constructorArgs ?? [],
    salt: Fr.ZERO,
    publicKeys,
    deployer: AztecAddress.ZERO,
  });
  if (instance.originalContractClassId.toString() !== SCHNORR_CLASS_ID) {
    throw new Error(
      `Schnorr class id mismatch: ${instance.originalContractClassId.toString()} != pinned ${SCHNORR_CLASS_ID}. SDK and testnet are out of sync.`,
    );
  }
  return instance.address;
}

console.log(`\n  Aztec Account Generator  ·  testnet\n`);

try {
  const s = spin('Deriving account');
  const secretKey = existingSecret ? Fr.fromHexString(existingSecret) : Fr.random();
  const address = await deriveSchnorrAddress(secretKey);
  s.ok(address.toString().slice(0, 20) + '…');

  console.log(`
  ${_C.di}secret${_C.rs}   ${secretKey.toString()}
  ${_C.di}address${_C.rs}  ${address.toString()}

  ${_C.di}Next:${_C.rs} paste your address into the faucet, wait ~3-4 min for the bridge,
  then run the claim command shown in the faucet UI.
`);

  process.exit(0);
} catch (err) {
  if (_sp) _sp.fail();
  const msg = err.message || String(err);
  console.error(`\n  Error: ${msg}\n`);
  process.exit(1);
}
