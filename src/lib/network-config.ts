// Single source of truth for all faucet configuration.
// Only FAUCET_PRIVATE_KEY and L1_RPC_URL come from env vars (secrets).
// Everything else lives here in code.

// ── Aztec Network ────────────────────────────────────────────────────────────
export const NODE_URL = "https://rpc.testnet.aztec-labs.com";
export const EXPLORER_TX_URL = "https://testnet.aztecscan.xyz/tx-effects";
export const NETWORK_LABEL = "Testnet";
export const NPM_TAG = "rc";
export const SCHNORR_CLASS_ID = "0x1e86cb5f3581f982b9c2c2b8a45fc4d0dfdb93cdab87e6deee55ec69d7f19703";

// ── L1 (Sepolia) ─────────────────────────────────────────────────────────────
export const L1_CHAIN_ID = 11155111;

// ── Drip Amounts ─────────────────────────────────────────────────────────────
export const ETH_DRIP_AMOUNT = "0.001";
export const FEE_JUICE_DRIP_AMOUNT = 100_000_000_000_000_000_000n; // 100 FJ

// ── Rate Limits ──────────────────────────────────────────────────────────────
// Defaults: 8h window, 3 drips per address, 6 drips per IP. Generous enough
// that devs iterating during a working session aren't blocked, tight enough
// to make abuse non-trivial. Override per environment via env vars; setting
// DRIP_INTERVAL_MS=0 disables drip rate limiting entirely (useful in dev).
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
export const DRIP_INTERVAL_MS = envInt("DRIP_INTERVAL_MS", 28_800_000);     // 8h
export const DRIP_MAX_PER_ADDRESS = envInt("DRIP_MAX_PER_ADDRESS", 3);
export const DRIP_MAX_PER_IP = envInt("DRIP_MAX_PER_IP", 6);

// ── Keygen Rate Limit ────────────────────────────────────────────────────────
// Keygen is essentially free (no chain interaction), but capping it prevents
// trivial scripted abuse of `/api/keygen` to derive arbitrary addresses.
export const KEYGEN_INTERVAL_MS = envInt("KEYGEN_INTERVAL_MS", 86_400_000); // 24h
export const KEYGEN_MAX_PER_IP = envInt("KEYGEN_MAX_PER_IP", 20);
