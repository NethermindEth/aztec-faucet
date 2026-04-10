// Single source of truth for all faucet configuration.
// Only FAUCET_PRIVATE_KEY and L1_RPC_URL come from env vars (secrets).
// Everything else lives here in code.

// ── Aztec Network ────────────────────────────────────────────────────────────
export const NODE_URL = "https://rpc.testnet.aztec-labs.com";
export const SPONSORED_FPC_ADDRESS = "0x19b5539ca1b104d4c3705de94e4555c9630def411f025e023a13189d0c56f8f2";
export const EXPLORER_URL = "https://testnet.aztecscan.xyz";
export const EXPLORER_TX_URL = "https://testnet.aztecscan.xyz/tx-effects";
export const NETWORK_LABEL = "Testnet";
export const NPM_TAG = "rc";
export const SCHNORR_CLASS_ID = "0x010319cf7faafaab5cbe684f2556e379a22539a8de18b35d290a85f30057bf02";

// ── L1 (Sepolia) ─────────────────────────────────────────────────────────────
export const L1_CHAIN_ID = 11155111;

// ── Drip Amounts ─────────────────────────────────────────────────────────────
export const ETH_DRIP_AMOUNT = "0.001";
export const FEE_JUICE_DRIP_AMOUNT = 100_000_000_000_000_000_000n; // 100 FJ

// ── Rate Limits ──────────────────────────────────────────────────────────────
// (flip to 86_400_000 / 1 / 2 before merging to main)
export const DRIP_INTERVAL_MS = 28_800_000;       // 8h (prod: 24h)
export const DRIP_MAX_PER_ADDRESS = 3;             // (prod: 1)
export const DRIP_MAX_PER_IP = 6;                  // (prod: 2)

// ── Keygen Rate Limit ────────────────────────────────────────────────────────
export const KEYGEN_INTERVAL_MS = 86_400_000;      // 24h
export const KEYGEN_MAX_PER_IP = 10;
