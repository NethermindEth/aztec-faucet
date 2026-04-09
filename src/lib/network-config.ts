export type Network = "devnet" | "testnet";

// Single source of truth for Aztec network config.
// These values change with network upgrades, so they live in code, not env vars.
export const NODE_URLS: Record<Network, string> = {
  devnet: "https://v4-devnet-3.aztec-labs.com/",
  testnet: "https://rpc.testnet.aztec-labs.com",
};

export const SPONSORED_FPC_ADDRESSES: Record<Network, string> = {
  devnet: "0x09a4df73aa47f82531a038d1d51abfc85b27665c4b7ca751e2d4fa9f19caffb2",
  testnet: "0x19b5539ca1b104d4c3705de94e4555c9630def411f025e023a13189d0c56f8f2",
};

export function getNodeUrl(network: Network): string {
  return NODE_URLS[network];
}

export function isTestnetAvailable(): boolean {
  return true;
}

export const EXPLORER_URLS: Record<Network, string> = {
  devnet: "https://devnet.aztecscan.xyz",
  testnet: "https://testnet.aztecscan.xyz",
};

/** Base path for Aztec L2 transaction links. Append the tx hash directly. */
export const EXPLORER_TX_URLS: Record<Network, string> = {
  devnet: "https://devnet.aztecscan.xyz/tx-effects",
  testnet: "https://testnet.aztecscan.xyz/tx-effects",
};

export const NETWORK_LABELS: Record<Network, string> = {
  devnet: "Devnet",
  testnet: "Testnet",
};

export const NPM_TAGS: Record<Network, string> = {
  devnet: "devnet",
  testnet: "rc",
};

/**
 * Schnorr account contract class ID for testnet (@rc SDK, 4.1.0-rc.3).
 * The class ID is deterministically derived from the contract artifact bytecode.
 * Devnet uses a different bytecode version (@devnet SDK), so the class ID differs.
 * Update this constant when the testnet network upgrades to a new SDK version.
 */
export const TESTNET_SCHNORR_CLASS_ID =
  "0x010319cf7faafaab5cbe684f2556e379a22539a8de18b35d290a85f30057bf02";
