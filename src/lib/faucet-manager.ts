import { type Hex, formatEther, isAddress } from "viem";
import { L1Faucet } from "./l1-faucet";
import { L2Faucet, type FeeJuiceClaimData } from "./l2-faucet";
import { Throttle, ThrottleError } from "./throttle";
import { ClaimStore, type StoredClaim } from "./claim-store";
import { NODE_URLS, SPONSORED_FPC_ADDRESSES } from "./network-config";

export type Asset = "eth" | "fee-juice";

export class AddressValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressValidationError";
  }
}

export type DripResult = {
  success: true;
  asset: Asset;
  txHash?: string;
  claimData?: FeeJuiceClaimData;
  claimId?: string;
  claimStatus?: "bridging" | "ready" | "expired";
};

export type FaucetStatus = {
  healthy: boolean;
  faucetAddress: string;
  l1BalanceEth: string;
  /** L1 Fee Juice ERC20 balance of the faucet wallet, formatted as a decimal string (e.g. "5000.0000"). Null if unavailable. */
  l1FeeJuiceBalance: string | null;
  assets: { name: Asset; available: boolean }[];
  network: {
    l1ChainId: number;
    aztecNodeUrl: string;
  };
  sdk: {
    faucetVersion: string;
    latestVersion: string | null;
    outdated: boolean;
  };
};

// Read the SDK version the faucet was built with
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPackageVersion(pkgPath: string): string {
  try {
    const raw = readFileSync(resolve(process.cwd(), pkgPath), "utf-8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

const DEVNET_SDK_VERSION = readPackageVersion("node_modules/@aztec/aztec.js/package.json");
const TESTNET_SDK_VERSION = readPackageVersion("node_modules/@aztec-rc/aztec.js/package.json");


// Use globalThis so the singleton survives Next.js HMR module reloads in dev.
// Without this, each hot-reload resets the module-level variable and the
// in-memory ClaimStore is wiped — causing GET /api/claim/[id] to 404
// immediately after a successful POST /api/drip.
const g = globalThis as typeof globalThis & {
  _faucetManagerDevnet?: FaucetManager;
  _faucetManagerTestnet?: FaucetManager;
};

export class FaucetManager {
  private l1Faucet: L1Faucet;
  private l2Faucet: L2Faucet;
  private throttle: Throttle;
  private ipThrottle: Throttle;
  private claimStore: ClaimStore;
  private network: "devnet" | "testnet";

  private constructor(network: "devnet" | "testnet" = "devnet") {
    this.network = network;
    const l1PrivateKey = requireEnv("FAUCET_PRIVATE_KEY") as Hex;
    const l1RpcUrl = requireEnv("L1_RPC_URL");
    const l1ChainId = parseIntEnv("L1_CHAIN_ID", 11155111);

    const aztecNodeUrl =
      network === "testnet"
        ? (process.env.TESTNET_AZTEC_NODE_URL ?? NODE_URLS.testnet)
        : (process.env.DEVNET_AZTEC_NODE_URL ?? process.env.AZTEC_NODE_URL ?? NODE_URLS.devnet);

    const sponsoredFpcAddress =
      network === "testnet"
        ? (process.env.TESTNET_SPONSORED_FPC_ADDRESS ?? SPONSORED_FPC_ADDRESSES.testnet)
        : (process.env.DEVNET_SPONSORED_FPC_ADDRESS ?? process.env.SPONSORED_FPC_ADDRESS ?? SPONSORED_FPC_ADDRESSES.devnet);

    this.l1Faucet = new L1Faucet({
      rpcUrl: l1RpcUrl,
      chainId: l1ChainId,
      privateKey: l1PrivateKey,
      ethDripAmount: process.env.ETH_DRIP_AMOUNT ?? "0.001",
    });

    // Per-network drip amount env vars take precedence over the network defaults.
    // FEE_JUICE_DRIP_AMOUNT is treated as a legacy devnet-only alias so that a
    // deployment which only sets FEE_JUICE_DRIP_AMOUNT=1000 FJ does NOT accidentally
    // use that value for testnet (which should default to 100 FJ to preserve the
    // pre-funded faucet wallet balance).
    const networkDripEnvKey = network === "testnet" ? "TESTNET_FEE_JUICE_DRIP_AMOUNT" : "DEVNET_FEE_JUICE_DRIP_AMOUNT";
    const feeJuiceDripAmount = process.env[networkDripEnvKey]
      ? BigInt(process.env[networkDripEnvKey]!)
      : network === "testnet"
        ? 100_000_000_000_000_000_000n   // testnet default: 100 FJ (portal minimum > 1 FJ)
        : process.env.FEE_JUICE_DRIP_AMOUNT
          ? parseBigIntEnv("FEE_JUICE_DRIP_AMOUNT")
          : 1_000_000_000_000_000_000_000n; // devnet default: 1000 FJ (contract minimum)

    this.l2Faucet = new L2Faucet({
      aztecNodeUrl,
      l1RpcUrl,
      l1ChainId,
      l1PrivateKey,
      sponsoredFpcAddress,
      feeJuiceDripAmount,
      // Devnet has an open mint function; testnet restricts mint to authorized minters.
      // On testnet the faucet wallet is pre-funded with L1 Fee Juice, so skip minting.
      mintFirst: network !== "testnet",
    });

    const intervalMs = parseIntEnv("DRIP_INTERVAL_MS", 86400000);
    this.throttle = new Throttle(intervalMs, 1);

    const ipIntervalMs = parseIntEnv("IP_DRIP_INTERVAL_MS", intervalMs);
    const ipMaxCount = parseIntEnv("IP_DRIP_MAX_COUNT", 2);
    this.ipThrottle = new Throttle(ipIntervalMs, ipMaxCount);

    this.claimStore = new ClaimStore(aztecNodeUrl);
  }

  static getInstance(network: "devnet" | "testnet" = "devnet"): FaucetManager {
    if (network === "testnet") {
      if (!g._faucetManagerTestnet) {
        g._faucetManagerTestnet = new FaucetManager("testnet");
      }
      return g._faucetManagerTestnet;
    }
    if (!g._faucetManagerDevnet) {
      g._faucetManagerDevnet = new FaucetManager("devnet");
    }
    return g._faucetManagerDevnet;
  }

  static isTestnetAvailable(): boolean {
    // Testnet is always available — public defaults exist in network-config.ts.
    return true;
  }

  async drip(address: string, asset: Asset, ip?: string): Promise<DripResult> {
    const trimmed = address.trim();
    this.validateAddress(trimmed, asset);

    const normalizedAddress = trimmed.toLowerCase();
    this.throttle.check(normalizedAddress, asset);
    if (ip) this.ipThrottle.check(ip, asset);

    let result: DripResult;

    switch (asset) {
      case "eth": {
        const txHash = await this.l1Faucet.sendEth(normalizedAddress as Hex);
        result = { success: true, asset, txHash };
        break;
      }
      case "fee-juice": {
        const claimData = await this.l2Faucet.bridgeFeeJuice(trimmed);
        const claimId = this.claimStore.add(trimmed, claimData);
        result = {
          success: true,
          asset,
          claimId,
          claimStatus: "bridging",
          // Include claimData in the initial response so the client has it
          // even if the polling endpoint later fails (e.g., server restart).
          claimData,
        };
        break;
      }
      default: {
        const _exhaustive: never = asset;
        throw new Error(`Unknown asset: ${_exhaustive}`);
      }
    }

    this.throttle.record(normalizedAddress, asset);
    if (ip) this.ipThrottle.record(ip, asset);
    return result;
  }

  getClaim(id: string): StoredClaim | undefined {
    return this.claimStore.get(id);
  }

  private validateAddress(address: string, asset: Asset): void {
    if (!address) {
      throw new AddressValidationError("Address is required");
    }

    if (asset === "eth") {
      if (!isAddress(address)) {
        throw new AddressValidationError(
          "Invalid Ethereum address. Expected a 0x-prefixed 40-character hex string (e.g. 0xAbC...123)",
        );
      }
    } else {
      // Aztec addresses are 0x-prefixed 64-character hex strings
      if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
        throw new AddressValidationError(
          "Invalid Aztec address. Expected a 0x-prefixed 64-character hex string (e.g. 0x09a4...fb2)",
        );
      }
    }
  }

  private async fetchNodeVersion(): Promise<string | null> {
    try {
      const res = await fetch(`${this.claimStore.nodeUrl}/node-info`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { nodeVersion: string };
      return data.nodeVersion ?? null;
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<FaucetStatus> {
    const faucetVersion = this.network === "testnet" ? TESTNET_SDK_VERSION : DEVNET_SDK_VERSION;

    const [l1Balance, feeJuiceRaw, nodeVersion] = await Promise.all([
      this.l1Faucet.getBalance(),
      this.l2Faucet.getL1FeeJuiceBalance(this.l1Faucet.address),
      this.fetchNodeVersion(),
    ]);

    const l1FeeJuiceBalance = feeJuiceRaw !== null ? formatEther(feeJuiceRaw) : null;

    return {
      healthy: true,
      faucetAddress: this.l1Faucet.address,
      l1BalanceEth: formatEther(l1Balance),
      l1FeeJuiceBalance,
      assets: [
        { name: "eth", available: true },
        { name: "fee-juice", available: true },
      ],
      network: {
        l1ChainId: parseInt(process.env.L1_CHAIN_ID ?? "11155111", 10),
        aztecNodeUrl: this.claimStore.nodeUrl,
      },
      sdk: {
        faucetVersion,
        latestVersion: nodeVersion,
        outdated: nodeVersion !== null && isSDKBehindNode(faucetVersion, nodeVersion),
      },
    };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable ${name}: "${raw}"`);
  }
  return parsed;
}

function parseBigIntEnv(name: string): bigint {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Invalid bigint for environment variable ${name}: "${raw}"`);
  }
}

/**
 * Returns true if the SDK version is behind the node version.
 * Extracts the base version (e.g. "4.1.1" from "4.1.1-rc.1") and compares.
 * SDK is "behind" if its base version is older than the node's base version.
 */
function isSDKBehindNode(sdkVersion: string, nodeVersion: string): boolean {
  const sdkBase = sdkVersion.replace(/-.*$/, "").split(".").map(Number);
  const nodeBase = nodeVersion.replace(/-.*$/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(sdkBase.length, nodeBase.length); i++) {
    const s = sdkBase[i] ?? 0;
    const n = nodeBase[i] ?? 0;
    if (s < n) return true;
    if (s > n) return false;
  }
  return false;
}

export { ThrottleError };
