import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { generateClaimSecret } from "@aztec/aztec.js/ethereum";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createLogger } from "@aztec/foundation/log";
import { FeeJuicePortalAbi } from "@aztec/l1-artifacts/FeeJuicePortalAbi";
import { createPublicClient, erc20Abi, http, maxUint256, parseEventLogs, type Hex } from "viem";
import { getFaucetL1Account } from "./faucet-l1-account";
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

// Deposit broadcast but no claim data yet (slow confirm, or the event couldn't
// be read). Surfaced as a distinct in-flight state, not a hard failure. (#53)
export class BridgeSubmittedError extends Error {
  readonly txHash: string;
  constructor(txHash: string) {
    super(
      `Your Fee Juice deposit was submitted (transaction ${txHash}) but is taking ` +
      `longer than usual to confirm. It may still arrive shortly; if it doesn't, ` +
      `you can request another drip.`,
    );
    this.name = "BridgeSubmittedError";
    this.txHash = txHash;
  }
}

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
      const account = getFaucetL1Account(this.config.l1PrivateKey);
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
    const allowance = await l1Client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, portalAddress],
    });
    // Anything below maxUint256 / 2 is either a leftover exact approve from
    // the old per-drip flow or another instance resetting it. Re-approve max.
    if (allowance >= maxUint256 / 2n) return;
    log.info(`Setting standing max Fee Juice allowance for portal ${portalAddress} (one-time)`);
    const hash = await l1Client.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
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
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      return balance;
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

    const [claimSecret, claimSecretHash] = await generateClaimSecret();
    const depositArgs = [
      recipient.toString() as Hex,
      amount,
      claimSecretHash.toString() as Hex,
    ] as const;

    // Until writeContract nothing has moved, so failures here stay retryable
    // (a shortfall reverts at simulate, before any deposit is sent).
    let txHash: Hex;
    try {
      await this.ensureStandingAllowance(tokenAddress, portalAddress);
      await l1Client.simulateContract({
        address: portalAddress,
        abi: FeeJuicePortalAbi,
        functionName: "depositToAztecPublic",
        args: depositArgs,
        account: l1Client.account,
      });
      log.info("Sending L1 Fee Juice to L2 to be claimed publicly");
      txHash = await l1Client.writeContract({
        address: portalAddress,
        abi: FeeJuicePortalAbi,
        functionName: "depositToAztecPublic",
        args: depositArgs,
        account: l1Client.account,
        chain: l1Client.chain,
      });
    } catch (err) {
      console.error("[faucet] Bridge deposit failed before broadcast:", err);
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

    // Deposit is on the wire now: recover the receipt and event, or surface a
    // distinct in-flight state so the dev isn't told it failed. (#53)
    const receipt = await this.awaitDepositReceipt(l1Client, txHash);
    if (!receipt) {
      this.logUnrecoverableDeposit(txHash, claimSecret, amount, recipient);
      throw new BridgeSubmittedError(txHash);
    }
    if (receipt.status !== "success") {
      // reverted: no funds moved, safe to retry
      throw new Error(
        "The Fee Juice bridge transaction reverted on L1 and no funds moved. " +
        "Please try again.",
      );
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
      // mined, but no leaf index to build a claim from
      this.logUnrecoverableDeposit(txHash, claimSecret, amount, recipient);
      throw new BridgeSubmittedError(txHash);
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
  }

  // waitForTransactionReceipt can time out while a tx is still pending; re-query
  // a few times before giving up. Null means still unconfirmed after all tries.
  private async awaitDepositReceipt(
    l1Client: ReturnType<typeof createExtendedL1Client>,
    txHash: Hex,
  ) {
    try {
      return await l1Client.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
    } catch {
      // timed out or RPC dropped the request; fall through to re-query
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      try {
        return await l1Client.getTransactionReceipt({ hash: txHash });
      } catch {
        // not mined yet, keep polling
      }
    }
    return null;
  }

  // The secret is the only key to these funds; log it for manual recovery
  // instead of dropping it into a stack trace. (#53)
  private logUnrecoverableDeposit(
    txHash: Hex,
    claimSecret: { toString(): string },
    amount: bigint,
    recipient: AztecAddress,
  ) {
    log.error(
      `[faucet][RECOVERY] Fee Juice deposit broadcast but not turned into a claim. ` +
      `Recover manually from this data: tx=${txHash} recipient=${recipient.toString()} ` +
      `amount=${amount.toString()} claimSecret=${claimSecret.toString()}`,
    );
  }

}
