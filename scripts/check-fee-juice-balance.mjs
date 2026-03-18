/**
 * Checks the L2 Fee Juice balance of an Aztec address.
 *
 * Usage:
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS --network testnet
 *   node scripts/check-fee-juice-balance.mjs --address 0xYOUR_AZTEC_ADDRESS --node https://...
 */
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

const DEFAULT_NODE_URLS = {
  testnet: "https://rpc.testnet.aztec-labs.com",
  devnet: "https://v4-devnet-2.aztec-labs.com/",
};

const address = getArg("address");
const networkArg = getArg("network");
const network = networkArg === "testnet" ? "testnet" : "devnet";
const nodeUrl = getArg("node") || process.env.AZTEC_NODE_URL || DEFAULT_NODE_URLS[network];

// Load SDK matching the network — devnet uses @aztec/*, testnet uses @aztec-rc/*
const SDK = network === "testnet" ? "@aztec-rc" : "@aztec";
const { createAztecNodeClient } = await import(`${SDK}/aztec.js/node`);
const { AztecAddress } = await import(`${SDK}/aztec.js/addresses`);
const { Fr } = await import(`${SDK}/aztec.js/fields`);
const { deriveStorageSlotInMap } = await import(`${SDK}/stdlib/hash`);

if (!address) {
  console.log(`
  Usage: node scripts/check-fee-juice-balance.mjs --address <aztec-address>

  Options:
    --address   Aztec address (required, 0x + 64 hex chars)
    --network   testnet or devnet (default: devnet)
    --node      Aztec node URL (overrides --network default)
`);
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
  console.error("\n  Error: Invalid Aztec address. Expected 0x + 64 hex characters.\n");
  process.exit(1);
}

try {
  const node = createAztecNodeClient(nodeUrl);
  const owner = AztecAddress.fromString(address);

  // Fee Juice contract at protocol address 0x05, balances in map at slot 1
  const feeJuiceAddress = AztecAddress.fromBigInt(5n);
  const balanceSlot = await deriveStorageSlotInMap(new Fr(1), owner);
  const balanceField = await node.getPublicStorageAt("latest", feeJuiceAddress, balanceSlot);
  const balance = balanceField.toBigInt();

  console.log(`
  Fee Juice Balance
  -----------------
  Address: ${address}
  Node:    ${nodeUrl}
  Balance: ${formatFeeJuice(balance)} Fee Juice (${balance.toString()} raw)
`);

  if (balance === 0n) {
    console.log(`  No balance found. Possible reasons:
    - Haven't requested Fee Juice from the faucet yet
    - L1→L2 bridge is still pending (~2 minutes)
    - Haven't claimed yet (run claim-fee-juice.mjs)
    - Fee Juice was already spent on transactions
`);
  }
} catch (err) {
  const msg = err.message || String(err);

  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error(`\n  Error: Cannot connect to Aztec node at ${nodeUrl}.\n`);
  } else {
    console.error(`\n  Error: ${msg}\n`);
  }

  process.exit(1);
}
