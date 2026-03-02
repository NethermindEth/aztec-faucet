import { type Hex, formatEther, isAddress } from "viem";
import { L1Faucet } from "./l1-faucet";
import { L2Faucet, type FeeJuiceClaimData } from "./l2-faucet";
import { Throttle, ThrottleError } from "./throttle";
import { ClaimStore, type StoredClaim } from "./claim-store";

export type Asset = "eth" | "fee-juice" | "test-token";

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
  assets: { name: Asset; available: boolean }[];
  network: {
    l1ChainId: number;
    aztecNodeUrl: string;
  };
};

let instance: FaucetManager | null = null;

export class FaucetManager {
  private l1Faucet: L1Faucet;
  private l2Faucet: L2Faucet;
  private throttle: Throttle;
  private ipThrottle: Throttle;
  private claimStore: ClaimStore;

  private constructor() {
    const l1PrivateKey = requireEnv("FAUCET_PRIVATE_KEY") as Hex;
    const l1RpcUrl = requireEnv("L1_RPC_URL");
    const l1ChainId = parseIntEnv("L1_CHAIN_ID", 11155111);
    const aztecNodeUrl = requireEnv("AZTEC_NODE_URL");

    this.l1Faucet = new L1Faucet({
      rpcUrl: l1RpcUrl,
      chainId: l1ChainId,
      privateKey: l1PrivateKey,
      ethDripAmount: process.env.ETH_DRIP_AMOUNT ?? "0.1",
    });

    this.l2Faucet = new L2Faucet({
      aztecNodeUrl,
      l1RpcUrl,
      l1ChainId,
      l1PrivateKey,
      sponsoredFpcAddress: requireEnv("SPONSORED_FPC_ADDRESS"),
      tokenContractAddress: process.env.L2_TOKEN_CONTRACT_ADDRESS,
      tokenDripAmount: process.env.TOKEN_DRIP_AMOUNT
        ? parseIntEnv("TOKEN_DRIP_AMOUNT", 100)
        : undefined,
      feeJuiceDripAmount: process.env.FEE_JUICE_DRIP_AMOUNT
        ? parseBigIntEnv("FEE_JUICE_DRIP_AMOUNT")
        : undefined,
      aztecAccountSecret: process.env.AZTEC_ACCOUNT_SECRET,
    });

    const intervalMs = parseIntEnv("DRIP_INTERVAL_MS", 3600000);
    this.throttle = new Throttle(intervalMs);

    const ipIntervalMs = parseIntEnv("IP_DRIP_INTERVAL_MS", intervalMs);
    this.ipThrottle = new Throttle(ipIntervalMs);

    this.claimStore = new ClaimStore(aztecNodeUrl);
  }

  static getInstance(): FaucetManager {
    if (!instance) {
      instance = new FaucetManager();
    }
    return instance;
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
        };
        break;
      }
      case "test-token": {
        const txHash = await this.l2Faucet.mintTestToken(trimmed);
        result = { success: true, asset, txHash };
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

  async getStatus(): Promise<FaucetStatus> {
    const l1Balance = await this.l1Faucet.getBalance();
    const hasTokenContract = !!process.env.L2_TOKEN_CONTRACT_ADDRESS;

    return {
      healthy: true,
      faucetAddress: this.l1Faucet.address,
      l1BalanceEth: formatEther(l1Balance),
      assets: [
        { name: "eth", available: true },
        { name: "fee-juice", available: true },
        { name: "test-token", available: hasTokenContract },
      ],
      network: {
        l1ChainId: parseInt(process.env.L1_CHAIN_ID ?? "11155111", 10),
        aztecNodeUrl: process.env.AZTEC_NODE_URL ?? "",
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

export { ThrottleError };
