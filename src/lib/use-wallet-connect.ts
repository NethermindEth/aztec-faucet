"use client";

import "@/lib/buffer-polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Wallet } from "@aztec/aztec.js/wallet";
import {
  cancelConnection,
  confirmConnection,
  discoverWallets,
  getChainInfo,
  initiateConnection,
  unwrapAddress,
  verificationEmojis,
  type DiscoverySession,
  type PendingConnection,
  type WalletChoice,
  type WalletProvider,
} from "@/lib/wallet-client";
import { faucetCapabilities } from "@/lib/wallet-capabilities";

// Opaque wallet-account wrappers; SDK doesn't export a stable shape.
type RawWalletAccount = unknown;
type RawWalletAccounts = readonly RawWalletAccount[];

// requestCapabilities first per wallet-sdk spec; getAccounts as fallback.
async function resolveGrantedAccounts(wallet: Wallet): Promise<RawWalletAccounts> {
  try {
    const granted = await wallet.requestCapabilities(faucetCapabilities());
    const accountsCap = granted.granted.find((c) => c.type === "accounts");
    const cap = accountsCap && "accounts" in accountsCap ? accountsCap.accounts : undefined;
    if (cap) return Array.from(cap);
  } catch (capErr) {
    console.warn("requestCapabilities failed, falling back to getAccounts:", capErr);
  }
  try {
    const accounts = await wallet.getAccounts();
    return Array.from(accounts as unknown[]);
  } catch (getErr) {
    console.warn("getAccounts fallback also failed:", getErr);
    return [];
  }
}

export type ConnectPhase =
  | { kind: "idle" }
  | { kind: "choosing" }
  | { kind: "discovering"; providers: WalletProvider[]; choice: WalletChoice }
  | { kind: "connecting"; provider: WalletProvider }
  | { kind: "verifying"; provider: WalletProvider; pending: PendingConnection; emojis: string }
  | { kind: "picking-account"; wallet: Wallet; accounts: string[] }
  | { kind: "connected"; wallet: Wallet; address: string }
  | { kind: "disconnected" }
  | { kind: "error"; message: string };

export function useWalletConnect() {
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });
  const sessionRef = useRef<DiscoverySession | null>(null);
  // Bumped on cleanup; lets an in-flight beginDiscovery detect supersession and cancel its orphaned session.
  const discoveryGenRef = useRef(0);
  // Connection provider; only its disconnect() removes the web wallet's floating panel.
  const panelProviderRef = useRef<WalletProvider | null>(null);
  // Unsubscribe for the provider-level onDisconnect watch; armed after connect, dropped on teardown.
  const disconnectUnsubRef = useRef<(() => void) | null>(null);
  // phaseRef so callbacks read latest phase without side effects in setState updaters (StrictMode double-invokes those).
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cleanup = useCallback(() => {
    discoveryGenRef.current++;
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }, []);

  // Removes the floating panel; separate from cleanup() so acknowledge() keeps it up.
  const teardownConnection = useCallback(() => {
    // Drop the disconnect watch first so our own teardown doesn't trip it.
    disconnectUnsubRef.current?.();
    disconnectUnsubRef.current = null;
    const provider = panelProviderRef.current;
    panelProviderRef.current = null;
    // Promise-wrapped so a sync throw mid-handshake is swallowed too.
    void Promise.resolve().then(() => provider?.disconnect()).catch(() => {});
  }, []);

  // After connect, watch for a wallet-side drop: clear the dead session, drop the
  // panel, and set the "disconnected" phase.
  const armDisconnectWatch = useCallback(() => {
    const provider = panelProviderRef.current;
    if (!provider) return;
    disconnectUnsubRef.current?.();
    disconnectUnsubRef.current = provider.onDisconnect(() => {
      const dropped = panelProviderRef.current;
      panelProviderRef.current = null;
      // Null the ref, don't call the unsubscribe: the SDK is mid-iterating its
      // disconnect callbacks here, so unsubscribing now would splice during iteration.
      disconnectUnsubRef.current = null;
      void Promise.resolve().then(() => dropped?.disconnect()).catch(() => {});
      setPhase({ kind: "disconnected" });
    });
  }, []);

  // Unmount is a real teardown: also drop the watch and panel (cleanup() alone leaks them).
  useEffect(() => () => { cleanup(); teardownConnection(); }, [cleanup, teardownConnection]);

  // Chooser first; discovery (and its extension prompt) is deferred to beginDiscovery.
  // Tear down any prior connection panel and warm the chain-info cache.
  const start = useCallback(() => {
    teardownConnection();
    void getChainInfo().catch(() => {});
    setPhase({ kind: "choosing" });
  }, [teardownConnection]);

  const beginDiscovery = useCallback(async (choice: WalletChoice) => {
    cleanup(); // cancel any prior session (re-pick / Retry)
    const gen = discoveryGenRef.current;
    setPhase({ kind: "discovering", providers: [], choice });
    try {
      const chainInfo = await getChainInfo();
      if (discoveryGenRef.current !== gen) return; // superseded or reset during the await
      sessionRef.current = discoverWallets(chainInfo, (p) => {
        setPhase((prev) =>
          prev.kind === "discovering"
            ? { kind: "discovering", providers: [...prev.providers, p], choice: prev.choice }
            : prev,
        );
      }, choice, 10000);
    } catch (err) {
      if (discoveryGenRef.current !== gen) return;
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to start discovery",
      });
    }
  }, [cleanup]);

  const pickProvider = useCallback(async (provider: WalletProvider) => {
    // Panel mounts in initiateConnection; hold the provider so abandon paths can remove it.
    panelProviderRef.current = provider;
    setPhase({ kind: "connecting", provider });
    try {
      const pending = await initiateConnection(provider);
      const emojis = verificationEmojis(pending);
      setPhase({ kind: "verifying", provider, pending, emojis });
    } catch (err) {
      teardownConnection();
      const raw = err instanceof Error ? err.message : "Failed to connect";
      const lower = raw.toLowerCase();
      const looksLikePopupBlocked =
        lower.includes("popup") ||
        lower.includes("blocked") ||
        lower.includes("window.open") ||
        lower.includes("not allowed") ||
        lower.includes("user gesture");
      setPhase({
        kind: "error",
        message: looksLikePopupBlocked
          ? "The wallet popup was blocked by your browser."
          : raw,
      });
    }
  }, [teardownConnection]);

  // Hard-refresh mid-verify orphans the PendingConnection wallet-side; SDK has no cross-page cancel. Wallets time it out; user can also dismiss in the wallet.
  const confirm = useCallback(async () => {
    const current = phaseRef.current;
    if (current.kind !== "verifying") return;
    try {
      const wallet = await confirmConnection(current.pending);
      const rawAccounts = await resolveGrantedAccounts(wallet);

      if (rawAccounts.length === 0) {
        // Empty accounts is ambiguous: the wallet may have no account at all,
        // or (likely on the v5-rc testnet) its accounts live on a different
        // rollup version than the one we advertise, so none match this chain.
        // Accounts are CAIP-10 scoped (aztec:<rollupVersion>:<address>), so a
        // version mismatch returns [] rather than an error. Cover both cases.
        let version = "";
        try {
          version = BigInt((await getChainInfo()).version.toString()).toString();
        } catch {}
        teardownConnection(); // unusable connection: remove its panel
        setPhase({
          kind: "error",
          message: `Your wallet connected but has no account on the current testnet${version ? ` (rollup ${version})` : ""}. It may be on a different network version, or have no account yet.`,
        });
        return;
      }

      const addresses = rawAccounts
        .map((a) => unwrapAddress(a))
        .filter((a): a is string => a !== null);

      if (addresses.length === 0) {
        teardownConnection();
        setPhase({ kind: "error", message: "Could not parse account address from wallet" });
        return;
      }

      // Connection is live; watch for a wallet-side drop from here on.
      armDisconnectWatch();
      if (addresses.length === 1) {
        setPhase({ kind: "connected", wallet, address: addresses[0] });
      } else {
        setPhase({ kind: "picking-account", wallet, accounts: addresses });
      }
    } catch (err) {
      teardownConnection();
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to confirm",
      });
    }
  }, [teardownConnection, armDisconnectWatch]);

  const pickAccount = useCallback((address: string) => {
    setPhase((prev) => {
      if (prev.kind !== "picking-account") return prev;
      return { kind: "connected", wallet: prev.wallet, address };
    });
  }, []);

  // "Switch account" entry: re-show picker without re-running discovery.
  const enterAccountPicker = useCallback((wallet: Wallet, accounts: string[]) => {
    setPhase({ kind: "picking-account", wallet, accounts });
  }, []);

  const reject = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === "verifying") {
      cancelConnection(current.pending); // removes the panel
      panelProviderRef.current = null;
    }
    setPhase({ kind: "idle" });
  }, []);

  // Abandon: also remove the floating panel. The bar uses acknowledge() to keep it.
  const reset = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === "verifying") {
      cancelConnection(current.pending); // cancelling the handshake removes the panel
      panelProviderRef.current = null;
    } else {
      teardownConnection();
    }
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup, teardownConnection]);

  // Clear the phase but keep the panel alive for the claim (unlike reset()).
  const acknowledge = useCallback(() => {
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup]);

  // Explicit disconnect: also remove the connected wallet's floating panel.
  const disconnectWallet = useCallback(() => {
    teardownConnection();
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup, teardownConnection]);

  return { phase, start, beginDiscovery, pickProvider, confirm, reject, reset, acknowledge, disconnectWallet, pickAccount, enterAccountPicker };
}
