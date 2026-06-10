"use client";

// EIP-6963 multi-wallet discovery — listener is permanent so late-injected
// wallets still register.

import { useCallback, useSyncExternalStore } from "react";

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

// Stable empty reference: server snapshot and pre-discovery client snapshot
// must be identical or useSyncExternalStore loops on hydration.
const EMPTY: AnnouncedProvider[] = [];
let cache: AnnouncedProvider[] = EMPTY;
const subscribers = new Set<() => void>();
let initialized = false;

function notify() {
  for (const cb of subscribers) cb();
}

function subscribe(cb: () => void): () => void {
  init();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// cache is replaced immutably on every announcement, so the reference is a
// valid useSyncExternalStore snapshot.
function getSnapshot(): AnnouncedProvider[] {
  return cache;
}

function getServerSnapshot(): AnnouncedProvider[] {
  return EMPTY;
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

  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function refreshEthereumProviders() {
  if (typeof window === "undefined") return;
  init();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getEthereumProviders(): AnnouncedProvider[] {
  init();
  return [...cache];
}

// Fallback for wallets that don't ship EIP-6963 yet; wrapped to share the
// AnnouncedProvider shape so callers don't special-case it.
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
  const providers = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const refresh = useCallback(() => {
    refreshEthereumProviders();
  }, []);

  return { providers, refresh };
}
