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
  | { kind: "connected"; wallet: Wallet; address: string }
  | { kind: "error"; message: string };

export function useWalletConnect() {
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });
  const sessionRef = useRef<DiscoverySession | null>(null);

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
      // Detect popup-blocker symptoms so the modal's ErrorBody can render
      // the "allow popups" guidance. Some web wallets (and some extension
      // wallets that delegate to a popup window) silently fail this way.
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

  // Note for support / future maintainers:
  //
  // If the user hard-refreshes (or closes the tab) while the modal is in
  // the "verifying" phase, the wallet side ends up holding a
  // PendingConnection that we never confirm or cancel. The wallet-sdk
  // protocol gives us no clean way to cancel that from the dApp on the
  // next page load — pending.cancel() requires a live PendingConnection
  // reference that's gone with the page. Most wallets time these out
  // server-side after a few minutes; if a user reports "Azguard says
  // connection is still pending" right after a refresh, that's why.
  // Workaround for the user is to dismiss the prompt inside the wallet.
  const confirm = useCallback(async () => {
    setPhase((prev) => {
      if (prev.kind !== "verifying") return prev;
      void (async () => {
        try {
          const wallet = await confirmConnection(prev.pending);
          const { unwrapAddress } = await import("@/lib/wallet-client");

          // Azguard shows the "Permission request" popup (capabilities + emoji
          // verification) as part of pending.confirm() — by the time
          // confirmConnection() resolves here, all capabilities are already
          // granted. Call getAccounts() directly to avoid triggering a
          // redundant requestCapabilities popup. Fall back to
          // requestCapabilities only if getAccounts is still unauthorized
          // (older wallet / SDK versions that don't pre-grant via confirm).
          let raw: unknown;
          try {
            const accounts = await wallet.getAccounts();
            raw = accounts[0];
          } catch {
            const { faucetCapabilities } = await import("@/lib/wallet-capabilities");
            try {
              const granted = await wallet.requestCapabilities(faucetCapabilities());
              const accountsCap = granted.granted.find((c) => c.type === "accounts");
              const accounts = accountsCap && "accounts" in accountsCap ? accountsCap.accounts : undefined;
              raw = accounts?.[0];
            } catch (capErr) {
              console.warn("requestCapabilities failed:", capErr);
            }
          }
          if (raw === undefined) {
            // Specific phrasing the modal's ErrorBody picks up to render
            // an actionable "create an account in your wallet" panel
            // instead of a generic error string. Common with brand-new
            // Azguard installs that haven't completed onboarding yet.
            setPhase({
              kind: "error",
              message: "Your wallet has no accounts. Create or import an Aztec account in the wallet, then connect again.",
            });
            return;
          }
          const address = unwrapAddress(raw);
          if (!address || address === "[object Object]") {
            setPhase({ kind: "error", message: "Could not parse account address from wallet" });
            return;
          }
          setPhase({ kind: "connected", wallet, address });
        } catch (err) {
          setPhase({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to confirm",
          });
        }
      })();
      return prev;
    });
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

  return { phase, start, pickProvider, confirm, reject, reset };
}
