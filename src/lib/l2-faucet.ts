import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { generateClaimSecret } from "@aztec/aztec.js/ethereum";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createLogger } from "@aztec/foundation/log";
import { FeeJuicePortalAbi } from "@aztec/l1-artifacts/FeeJuicePortalAbi";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, maxUint256, nonceManager, parseEventLogs, type Hex, parseAbiItem } from "viem";
import { sepolia, foundry } from "viem/chains";
import type { Chain } from "viem";

const log = createLogger("faucet:l2");

type L2FaucetConfig = {
  aztecNodeUrl: string;
  l1RpcUrl: string;
  l1ChainId: number;
  l1PrivateKey: Hex;
  feeJuiceDripAmount?: bigint;
};

export type FeeJuiceClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
  l1TxHash?: string;
};

export class L2Faucet {
  private aztecNode;
  // Cached per-instance — contract addresses and L1 client never change at runtime
  private _l1Client: ReturnType<typeof createExtendedL1Client> | null = null;
  private _nodeInfoPromise: Promise<Awaited<ReturnType<ReturnType<typeof createAztecNodeClient>["getNodeInfo"]>>> | null = null;

  constructor(private config: L2FaucetConfig) {
    this.aztecNode = createAztecNodeClient(config.aztecNodeUrl);
  }

  private getL1Client(): ReturnType<typeof createExtendedL1Client> {
    if (!this._l1Client) {
      // Shared nonce manager (same singleton as L1Faucet): serializes nonce
      // allocation for concurrent sends from the shared faucet wallet.
      const account = privateKeyToAccount(this.config.l1PrivateKey, { nonceManager });
      const chain = createEthereumChain([this.config.l1RpcUrl], this.config.l1ChainId);
      // viem is duplicated in the dep tree (root viem vs @aztec/ethereum's nested viem).
      // The two PrivateKeyAccount types are structurally identical but TypeScript can't
      // unify them because their nested NonceManager.consume signatures reference
      // different Client classes. Runtime is fine; the cast is a type-level workaround.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._l1Client = createExtendedL1Client([this.config.l1RpcUrl], account as any, chain.chainInfo);
    }
    return this._l1Client;
  }

  /**
   * One-time maxUint256 approve for the portal. OZ v5 never decrements an
   * infinite allowance and the portal only pulls from msg.sender, so this
   * removes the per-deposit approve whose allowance a concurrent drip can
   * steal (ERC20InsufficientAllowance).
   */
  private async ensureStandingAllowance(tokenAddress: Hex, portalAddress: Hex): Promise<void> {
    const l1Client = this.getL1Client();
    const owner = l1Client.account.address;
    const allowance = (await l1Client.readContract({
      address: tokenAddress,
      abi: [parseAbiItem("function allowance(address, address) view returns (uint256)")],
      functionName: "allowance",
      args: [owner, portalAddress],
    })) as bigint;
    // Anything below maxUint256 / 2 is either a leftover exact approve from
    // the old per-drip flow or another instance resetting it. Re-approve max.
    if (allowance >= maxUint256 / 2n) return;
    log.info(`Setting standing max Fee Juice allowance for portal ${portalAddress} (one-time)`);
    const hash = await l1Client.writeContract({
      address: tokenAddress,
      abi: [parseAbiItem("function approve(address, uint256) returns (bool)")],
      functionName: "approve",
      args: [portalAddress, maxUint256],
    });
    const receipt = await l1Client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`L1 approve transaction reverted on-chain (tx ${hash})`);
    }
  }

  private getNodeInfo() {
    if (!this._nodeInfoPromise) {
      this._nodeInfoPromise = this.aztecNode.getNodeInfo().catch((err) => {
        this._nodeInfoPromise = null;
        throw err;
      });
    }
    return this._nodeInfoPromise;
  }

  /**
   * Returns the faucet wallet's L1 Fee Juice ERC20 balance.
   * On testnet the faucet is pre-funded — this shows how much is left to drip.
   * Returns null on any failure (non-critical — status still works without it).
   */
  async getL1FeeJuiceBalance(walletAddress: Hex): Promise<bigint | null> {
    try {
      const nodeInfo = await this.getNodeInfo();
      const tokenAddress = nodeInfo.l1ContractAddresses.feeJuiceAddress.toString() as Hex;
      const CHAIN_MAP: Record<number, Chain> = { [sepolia.id]: sepolia, [foundry.id]: foundry };
      const chain: Chain = CHAIN_MAP[this.config.l1ChainId] ?? {
        id: this.config.l1ChainId,
        name: `Chain ${this.config.l1ChainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [this.config.l1RpcUrl] } },
      };
      const publicClient = createPublicClient({ chain, transport: http(this.config.l1RpcUrl) });
      const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")],
        functionName: "balanceOf",
        args: [walletAddress],
      });
      return balance as bigint;
    } catch {
      return null;
    }
  }

  /**
   * Bridge Fee Juice from L1 to L2 for a recipient.
   * Returns claim data that the recipient uses to claim on L2.
   *
   * Deposits directly rather than via the SDK's bridgeTokensPublic, which
   * approves per deposit (see ensureStandingAllowance) and reports success
   * without checking receipt.status.
   */
  async bridgeFeeJuice(
    recipientAztecAddress: string,
  ): Promise<FeeJuiceClaimData> {
    const recipient = AztecAddress.fromString(recipientAztecAddress);
    const l1Client = this.getL1Client();
    const amount = this.config.feeJuiceDripAmount;
    if (amount === undefined) {
      throw new Error("feeJuiceDripAmount is not configured");
    }

    let portalAddress: Hex;
    let tokenAddress: Hex;
    try {
      const nodeInfo = await this.getNodeInfo();
      portalAddress = nodeInfo.l1ContractAddresses.feeJuicePortalAddress.toString() as Hex;
      tokenAddress = nodeInfo.l1ContractAddresses.feeJuiceAddress.toString() as Hex;
    } catch (err) {
      console.error("[faucet] Failed to resolve L1 bridge contracts:", err);
      throw new Error(
        "Could not connect to the Fee Juice bridge contract on L1. " +
        "The network contracts may be temporarily unavailable. Please try again in a few minutes.",
      );
    }

    try {
      await this.ensureStandingAllowance(tokenAddress, portalAddress);

      const [claimSecret, claimSecretHash] = await generateClaimSecret();
      const depositArgs = [
        recipient.toString() as Hex,
        amount,
        claimSecretHash.toString() as Hex,
      ] as const;

      // Simulate first so reverts surface as readable errors before broadcast.
      await l1Client.simulateContract({
        address: portalAddress,
        abi: FeeJuicePortalAbi,
        functionName: "depositToAztecPublic",
        args: depositArgs,
        account: l1Client.account,
      });
      log.info("Sending L1 Fee Juice to L2 to be claimed publicly");
      const txHash = await l1Client.writeContract({
        address: portalAddress,
        abi: FeeJuicePortalAbi,
        functionName: "depositToAztecPublic",
        args: depositArgs,
        account: l1Client.account,
        chain: l1Client.chain,
      });
      const receipt = await l1Client.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`L1 deposit transaction reverted on-chain (tx ${txHash})`);
      }

      // secretHash match is a guard against ABI/event-shape drift.
      const deposits = parseEventLogs({
        abi: FeeJuicePortalAbi,
        logs: receipt.logs,
        eventName: "DepositToAztecPublic",
      });
      const secretHashHex = claimSecretHash.toString().toLowerCase();
      const deposit = deposits.find(
        (e) => (e.args.secretHash as string).toLowerCase() === secretHashHex,
      );
      if (!deposit) {
        throw new Error(
          `Deposit tx ${txHash} succeeded but no matching DepositToAztecPublic event was found`,
        );
      }
      log.info(`Deposited to Aztec public successfully (tx ${txHash}, leaf ${deposit.args.index})`);

      return {
        claimAmount: amount.toString(),
        claimSecretHex: claimSecret.toString(),
        claimSecretHashHex: claimSecretHash.toString(),
        messageHashHex: deposit.args.key as string,
        messageLeafIndex: (deposit.args.index as bigint).toString(),
        l1TxHash: txHash,
      };
    } catch (err) {
      console.error("[faucet] Bridge tx failed:", err);
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (
        msg.includes("insufficient funds") ||
        msg.includes("insufficient balance") ||
        msg.includes("erc20insufficientbalance") ||
        msg.includes("not enough balance") ||
        msg.includes("erc20: transfer amount exceeds balance") ||
        msg.includes("transfer amount exceeds balance")
      ) {
        const { FaucetInsufficientFundsError } = await import("./l1-faucet");
        throw new FaucetInsufficientFundsError("Fee Juice");
      }
      throw new Error(
        "The Fee Juice bridge transaction failed. " +
        "This may be a temporary network issue. Please wait a moment and try again.",
      );
    }
  }

}
