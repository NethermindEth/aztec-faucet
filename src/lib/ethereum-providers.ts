"use client";

// EIP-6963 multi-wallet discovery for Ethereum providers.
//
// Why this file exists:
//
// Pre-EIP-6963, dApps reached the user's wallet via a single `window.ethereum`
// global. With Rabby + MetaMask + Coinbase Wallet all installed, that global
// resolves to whichever extension last won the race to assign it (or to a
// proxy overlay). Clicking "Connect MetaMask" then unpredictably pops Rabby.
// EIP-6963 fixes this: each wallet emits an `eip6963:announceProvider` event
// containing its identity (uuid, name, icon, rdns) and its EIP-1193 provider.
// The dApp listens, collects all announces, and lets the user pick.
//
// Late-injection: some extensions inject *after* DOMContentLoaded. Our
// listener is attached at module-init time and stays attached forever, so
// even wallets that announce hundreds of milliseconds late are picked up.
// Calling `refresh()` re-dispatches the request event, which is harmless to
// repeat and useful when the user explicitly clicks Connect.

import { useCallback, useEffect, useState } from "react";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type AnnouncedProvider = {
  info: ProviderInfo;
  provider: EthereumProvider;
};

let cache: AnnouncedProvider[] = [];
const subscribers = new Set<(list: AnnouncedProvider[]) => void>();
let initialized = false;

function notify() {
  const snapshot = [...cache];
  for (const cb of subscribers) cb(snapshot);
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent).detail as AnnouncedProvider | undefined;
    if (!detail?.info?.uuid || !detail?.provider) return;
    if (cache.some((p) => p.info.uuid === detail.info.uuid)) return;
    cache = [...cache, detail];
    notify();
  });

  // Kick the wallets to announce themselves now that we're listening.
  // Wallets that inject after this event still announce (most do so
  // unprompted as well), so missing this race is fine.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// Force a re-announce. Useful when the user clicks Connect — covers the
// edge case where everything was set up before any wallet was injected.
export function refreshEthereumProviders() {
  if (typeof window === "undefined") return;
  init();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// Snapshot of the current list without subscribing — useful for one-shot
// fallback decisions during click handlers.
export function getEthereumProviders(): AnnouncedProvider[] {
  init();
  return [...cache];
}

// Legacy fallback: if nothing announces within a short window, surface
// `window.ethereum` so users with old wallets that haven't shipped EIP-6963
// support yet can still connect. Returned as a synthesised AnnouncedProvider
// with a placeholder uuid so the rest of the UI doesn't have to special-case it.
export function getLegacyEthereumProvider(): AnnouncedProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth) return null;
  return {
    info: {
      uuid: "legacy-window-ethereum",
      name: "Browser Wallet",
      icon: "",
      rdns: "legacy.ethereum",
    },
    provider: eth,
  };
}

export function useEthereumProviders() {
  const [list, setList] = useState<AnnouncedProvider[]>(() => {
    init();
    return [...cache];
  });

  useEffect(() => {
    init();
    subscribers.add(setList);
    setList([...cache]);
    return () => {
      subscribers.delete(setList);
    };
  }, []);

  const refresh = useCallback(() => {
    refreshEthereumProviders();
  }, []);

  return { providers: list, refresh };
}
