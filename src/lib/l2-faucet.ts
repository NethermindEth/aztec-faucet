import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createPublicClient, http, type Hex, parseAbiItem } from "viem";
import { sepolia, foundry } from "viem/chains";
import type { Chain } from "viem";

export type L2FaucetConfig = {
  aztecNodeUrl: string;
  l1RpcUrl: string;
  l1ChainId: number;
  l1PrivateKey: Hex;
  sponsoredFpcAddress: string;
  feeJuiceDripAmount?: bigint;
  /** Whether to mint L1 Fee Juice before bridging. True for devnet (open mint), false for testnet (pre-funded wallet). */
  mintFirst?: boolean;
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
  private fpcAddress: AztecAddress;

  constructor(private config: L2FaucetConfig) {
    this.aztecNode = createAztecNodeClient(config.aztecNodeUrl);
    this.fpcAddress = AztecAddress.fromString(config.sponsoredFpcAddress);
  }

  /**
   * Returns the faucet wallet's L1 Fee Juice ERC20 balance.
   * On testnet the faucet is pre-funded — this shows how much is left to drip.
   * Returns null on any failure (non-critical — status still works without it).
   */
  async getL1FeeJuiceBalance(walletAddress: Hex): Promise<bigint | null> {
    try {
      const nodeInfo = await this.aztecNode.getNodeInfo();
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
   */
  async bridgeFeeJuice(
    recipientAztecAddress: string,
  ): Promise<FeeJuiceClaimData> {
    const recipient = AztecAddress.fromString(recipientAztecAddress);

    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(this.config.l1PrivateKey);
    const chain = createEthereumChain(
      [this.config.l1RpcUrl],
      this.config.l1ChainId,
    );
    const l1Client = createExtendedL1Client(
      [this.config.l1RpcUrl],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem version mismatch between top-level and @aztec/ethereum
      account as any,
      chain.chainInfo,
    );

    let portalManager;
    try {
      portalManager = await L1FeeJuicePortalManager.new(
        this.aztecNode,
        l1Client,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console as any,
      );
    } catch (err) {
      console.error("[faucet] Portal manager init failed:", err);
      throw new Error(
        "Could not connect to the Fee Juice bridge contract on L1. " +
        "The network contracts may be temporarily unavailable. Please try again in a few minutes.",
      );
    }

    // Capture block number before the bridge call — the tx must land in a block >= preBlock.
    let preBlock: bigint | undefined;
    try {
      preBlock = await l1Client.getBlockNumber();
    } catch {
      // Non-critical — log lookup will fall back to a wider range
    }

    let claim;
    try {
      claim = await portalManager.bridgeTokensPublic(
        recipient,
        this.config.feeJuiceDripAmount,
        this.config.mintFirst ?? true, // devnet: mint first (open mint); testnet: use pre-funded wallet balance
      );
    } catch (err) {
      console.error("[faucet] Bridge tx failed:", err);
      throw new Error(
        "The Fee Juice bridge transaction failed. " +
        "This may be a temporary network issue. Please wait a moment and try again.",
      );
    }

    // Look up the L1 tx hash by querying the DepositToAztecPublic event log,
    // matched by messageHash (the `key` field). Non-critical — we proceed without it on failure.
    let l1TxHash: string | undefined;
    try {
      const nodeInfo = await this.aztecNode.getNodeInfo();
      const portalAddr = nodeInfo.l1ContractAddresses.feeJuicePortalAddress.toString() as Hex;
      const postBlock = await l1Client.getBlockNumber();
      // fromBlock = block before bridge (guaranteed to contain the tx); fallback to postBlock - 10
      const fromBlock = preBlock ?? (postBlock > 10n ? postBlock - 10n : 0n);
      const logs = await l1Client.getLogs({
        address: portalAddr,
        event: parseAbiItem("event DepositToAztecPublic(bytes32 indexed to, uint256 amount, bytes32 secretHash, bytes32 key, uint256 index)"),
        fromBlock,
        toBlock: postBlock + 1n,
      });
      const match = logs.find(
        (log) => log.args.key?.toLowerCase() === claim.messageHash.toLowerCase(),
      );
      l1TxHash = match?.transactionHash;
    } catch (err) {
      console.error("[faucet] Failed to look up L1 tx hash:", err);
    }

    return {
      claimAmount: claim.claimAmount.toString(),
      claimSecretHex: claim.claimSecret.toString(),
      claimSecretHashHex: claim.claimSecretHash.toString(),
      messageHashHex: claim.messageHash,
      messageLeafIndex: claim.messageLeafIndex.toString(),
      l1TxHash,
    };
  }

}
