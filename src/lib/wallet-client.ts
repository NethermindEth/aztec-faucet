"use client";

import "@/lib/buffer-polyfill";
import { Fr } from "@aztec/aztec.js/fields";
import type { ChainInfo } from "@aztec/aztec.js/account";
import type { Wallet } from "@aztec/aztec.js/wallet";
import {
  WalletManager,
  type WalletProvider,
  type PendingConnection,
  type DiscoverySession,
} from "@aztec/wallet-sdk/manager";
import { hashToEmoji } from "@aztec/wallet-sdk/crypto";
import { NODE_URL, L1_CHAIN_ID } from "@/lib/network-config";

export const APP_ID = "aztec-faucet";

let cachedChainInfo: ChainInfo | null = null;

export async function getChainInfo(): Promise<ChainInfo> {
  if (cachedChainInfo) return cachedChainInfo;
  const res = await fetch(`/api/node-info?network=testnet`).catch(() => null);
  if (res?.ok) {
    const j = await res.json();
    if (j?.l1ChainId !== undefined && j?.rollupVersion !== undefined) {
      cachedChainInfo = {
        chainId: new Fr(BigInt(j.l1ChainId)),
        version: new Fr(BigInt(j.rollupVersion)),
      };
      return cachedChainInfo;
    }
  }
  const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
  const node = createAztecNodeClient(NODE_URL);
  const info = await node.getNodeInfo();
  cachedChainInfo = {
    chainId: new Fr(BigInt(info.l1ChainId ?? L1_CHAIN_ID)),
    version: new Fr(BigInt(info.rollupVersion ?? 1)),
  };
  return cachedChainInfo;
}

export type WalletChoice = "extension" | "web";

// Discover only the chosen source: extension discovery doubles as the wallet's
// approval prompt, so probing both up front prompts before the user picks.
export function discoverWallets(
  chainInfo: ChainInfo,
  onWalletDiscovered: (provider: WalletProvider) => void,
  choice: WalletChoice,
  timeoutMs = 5000,
): DiscoverySession {
  return WalletManager.configure({
    extensions: { enabled: choice === "extension" },
    // Aztec v5 demo wallet (web-wallet iframe).
    webWallets: { urls: choice === "web" ? ["https://demo-wallet.aztec-labs.com"] : [] },
  }).getAvailableWallets({
    chainInfo,
    appId: APP_ID,
    timeout: timeoutMs,
    onWalletDiscovered,
  });
}

export async function initiateConnection(
  provider: WalletProvider,
): Promise<PendingConnection> {
  return provider.establishSecureChannel(APP_ID);
}

export async function confirmConnection(
  pending: PendingConnection,
): Promise<Wallet> {
  return pending.confirm();
}

export function cancelConnection(pending: PendingConnection): void {
  pending.cancel();
}

export function verificationEmojis(pending: PendingConnection): string {
  return hashToEmoji(pending.verificationHash);
}

// Aliased<AztecAddress> unwrap (wrapper may have .item or .address); null if no usable string form.
export function unwrapAddress(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw == null) return null;
  const r = raw as {
    item?: unknown;
    address?: unknown;
    toString?: () => string;
  };
  const inner = r.item ?? r.address ?? r;
  if (typeof inner === "string") return inner;
  if (inner && typeof (inner as { toString?: () => string }).toString === "function") {
    const s = (inner as { toString: () => string }).toString();
    // Default Object.prototype.toString = unwrap failed.
    if (s && s !== "[object Object]") return s;
  }
  return null;
}

export type { WalletProvider, PendingConnection, DiscoverySession };
