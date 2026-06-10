import {
  createPublicClient,
  createWalletClient,
  http,
  nonceManager,
  parseEther,
  type Hex,
  type Chain,
  type HttpTransport,
  type Account,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { sepolia, foundry } from "viem/chains";
type L1FaucetConfig = {
  rpcUrl: string;
  chainId: number;
  privateKey: Hex;
  ethDripAmount: string; // e.g. "0.1"
};

const CHAIN_MAP: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [foundry.id]: foundry,
};

export class FaucetInsufficientFundsError extends Error {
  constructor(asset: string) {
    super(
      `The faucet has insufficient ${asset} balance to process this request. ` +
        "Please try again later or contact the faucet operator.",
    );
    this.name = "FaucetInsufficientFundsError";
  }
}

export class L1Faucet {
  private publicClient;
  private walletClient;
  private account: PrivateKeyAccount;
  private chain: Chain;

  constructor(private config: L1FaucetConfig) {
    this.chain = CHAIN_MAP[config.chainId] ?? {
      id: config.chainId,
      name: `Chain ${config.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    };

    // Process-wide nonce manager: ETH and Fee Juice drips send from the same
    // wallet, possibly concurrently; without it simultaneous sends grab the
    // same pending nonce.
    this.account = privateKeyToAccount(config.privateKey, { nonceManager });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient<HttpTransport, Chain, Account>({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
  }

  get address(): Hex {
    return this.account.address;
  }

  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.account.address });
  }

  async sendEth(to: Hex): Promise<Hex> {
    try {
      const hash = await this.walletClient.sendTransaction({
        account: this.account,
        to,
        value: parseEther(this.config.ethDripAmount),
        chain: this.chain,
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (
        msg.includes("insufficient funds") ||
        msg.includes("insufficient balance") ||
        msg.includes("not enough balance") ||
        msg.includes("sender balance")
      ) {
        throw new FaucetInsufficientFundsError("ETH");
      }
      throw err;
    }
  }

}
