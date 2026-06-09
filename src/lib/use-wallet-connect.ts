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
  verificationEmojis,
  type DiscoverySession,
  type PendingConnection,
  type WalletProvider,
} from "@/lib/wallet-client";

export type ConnectPhase =
  | { kind: "idle" }
  | { kind: "discovering"; providers: WalletProvider[] }
  | { kind: "connecting"; provider: WalletProvider }
  | { kind: "verifying"; provider: WalletProvider; pending: PendingConnection; emojis: string }
  | { kind: "picking-account"; wallet: Wallet; accounts: string[] }
  | { kind: "connected"; wallet: Wallet; address: string }
  | { kind: "error"; message: string };

export function useWalletConnect() {
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });
  const sessionRef = useRef<DiscoverySession | null>(null);
  // Mirrors `phase` so callbacks can read the latest value without becoming
  // stale closures and without putting side-effecty reads in setState updaters
  // (React StrictMode dev-mode runs updaters twice, which fires wallet popups
  // twice for any side effect placed inside an updater).
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cleanup = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setPhase({ kind: "discovering", providers: [] });
    try {
      const chainInfo = await getChainInfo();
      sessionRef.current = discoverWallets(chainInfo, (p) => {
        setPhase((prev) =>
          prev.kind === "discovering"
            ? { kind: "discovering", providers: [...prev.providers, p] }
            : prev,
        );
      }, 10000);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to start discovery",
      });
    }
  }, []);

  const pickProvider = useCallback(async (provider: WalletProvider) => {
    setPhase({ kind: "connecting", provider });
    try {
      const pending = await initiateConnection(provider);
      const emojis = verificationEmojis(pending);
      setPhase({ kind: "verifying", provider, pending, emojis });
    } catch (err) {
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
  }, []);

  // Hard-refresh while "verifying" leaves a PendingConnection orphaned on the
  // wallet side; the SDK has no cross-page cancel. Wallets time it out
  // server-side. Support workaround: user dismisses the prompt in the wallet.
  const confirm = useCallback(async () => {
    const current = phaseRef.current;
    if (current.kind !== "verifying") return;
    try {
      const wallet = await confirmConnection(current.pending);
      const { unwrapAddress } = await import("@/lib/wallet-client");

      // wallet-sdk spec: request the appCapabilities manifest first so the
      // wallet knows what scope to grant. getAccounts is the fallback for
      // wallets that grant accounts implicitly.
      let rawAccounts: unknown[] | undefined;
      try {
        const { faucetCapabilities } = await import("@/lib/wallet-capabilities");
        const granted = await wallet.requestCapabilities(faucetCapabilities());
        const accountsCap = granted.granted.find((c) => c.type === "accounts");
        const cap = accountsCap && "accounts" in accountsCap ? accountsCap.accounts : undefined;
        rawAccounts = cap ? Array.from(cap) : undefined;
      } catch (capErr) {
        console.warn("requestCapabilities failed, falling back to getAccounts:", capErr);
        try {
          const accounts = await wallet.getAccounts();
          rawAccounts = Array.from(accounts as unknown[]);
        } catch {
          // both paths failed; rawAccounts stays undefined and we surface
          // the empty-accounts error below
        }
      }

      if (!rawAccounts || rawAccounts.length === 0) {
        setPhase({
          kind: "error",
          message: "Your wallet has no accounts. Create or import an Aztec account in the wallet, then connect again.",
        });
        return;
      }

      const addresses = rawAccounts
        .map((a) => unwrapAddress(a))
        .filter((a) => a && a !== "[object Object]");

      if (addresses.length === 0) {
        setPhase({ kind: "error", message: "Could not parse account address from wallet" });
        return;
      }

      if (addresses.length === 1) {
        setPhase({ kind: "connected", wallet, address: addresses[0] });
      } else {
        setPhase({ kind: "picking-account", wallet, accounts: addresses });
      }
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to confirm",
      });
    }
  }, []);

  const pickAccount = useCallback((address: string) => {
    setPhase((prev) => {
      if (prev.kind !== "picking-account") return prev;
      return { kind: "connected", wallet: prev.wallet, address };
    });
  }, []);

  // Called by the bar's "Switch account" to re-show the picker without
  // going through discovery again.
  const enterAccountPicker = useCallback((wallet: Wallet, accounts: string[]) => {
    setPhase({ kind: "picking-account", wallet, accounts });
  }, []);

  const reject = useCallback(() => {
    setPhase((prev) => {
      if (prev.kind === "verifying") cancelConnection(prev.pending);
      return { kind: "idle" };
    });
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup]);

  return { phase, start, pickProvider, confirm, reject, reset, pickAccount, enterAccountPicker };
}
