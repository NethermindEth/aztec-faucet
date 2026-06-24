"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { useWalletConnect } from "@/lib/use-wallet-connect";
import { WalletConnectModal } from "./wallet-connect-modal";
import { EthereumWalletPicker } from "./ethereum-wallet-picker";
import {
  useEthereumProviders,
  refreshEthereumProviders,
  getEthereumProviders,
  getLegacyEthereumProvider,
  type AnnouncedProvider,
  type EthereumProvider,
} from "@/lib/ethereum-providers";
import { unwrapAddress } from "@/lib/wallet-client";
import { L1_CHAIN_ID, IN_WALLET_CLAIM_ENABLED } from "@/lib/network-config";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { useOnValueChange } from "@/lib/use-on-value-change";

type Props = {
  asset: string;
  currentFormAddress?: string;
  onAddress: (address: string) => void;
  onWalletConnect?: (wallet: Wallet | null) => void;
  registerDisconnect?: (fn: (() => void) | null) => void;
};

const STORAGE_KEY = "faucet:wallet-connections";

type Persisted = {
  aztec?: string | null;
  eth?: string | null;
  // EIP-6963 rdns of last-picked wallet — used to re-attach without prompting.
  ethRdns?: string | null;
};

function readPersisted(): Persisted {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function writePersisted(p: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / disabled storage
  }
}

function shortAddr(addr: string): string {
  if (!addr.startsWith("0x") || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnectBar({ asset, currentFormAddress = "", onAddress, onWalletConnect, registerDisconnect }: Props) {
  const isEth = asset === "eth";

  const [aztecAddr, setAztecAddr] = useState<string | null>(null);
  const aztecWalletRef = useRef<import("@aztec/aztec.js/wallet").Wallet | null>(null);
  // Set when the wallet drops the link on its own side; drives a reconnect hint.
  const [aztecDropped, setAztecDropped] = useState(false);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [ethBusy, setEthBusy] = useState(false);
  const [ethError, setEthError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Shown if MetaMask popup hasn't resolved in 1.5s — popup may be off-screen.
  const [showBusyHint, setShowBusyHint] = useState(false);

  // Pinned EIP-6963 provider, not window.ethereum — Rabby/MetaMask/Coinbase
  // overwrite each other's global, this keeps calls on the picked wallet.
  const ethProviderRef = useRef<EthereumProvider | null>(null);

  // Restore the persisted eth address after hydration. Aztec connections
  // don't survive reloads (Wallet object isn't serialisable); clear any
  // stale aztec key written by older code.
  useDeferredEffect(() => {
    const p = readPersisted();
    if (p.eth) setEthAddr(p.eth);
    if (p.aztec) writePersisted({ ...p, aztec: null });
  }, []);

  const azguard = useWalletConnect();

  // Destructured so the effect keys on the phase value, not the hook's
  // per-render wrapper object; reset is a stable useCallback.
  const { phase: azPhase, acknowledge: azAck, disconnectWallet: azDisconnect } = azguard;

  // Clears local Aztec connection state; the recipient form is asset-specific and handled by callers.
  const clearAztecConnection = useCallback(() => {
    setAztecAddr(null);
    aztecWalletRef.current = null;
    onWalletConnect?.(null);
  }, [onWalletConnect]);

  // Hands the connected wallet off to local state.
  useDeferredEffect(() => {
    if (azPhase.kind !== "connected") return;
    aztecWalletRef.current = azPhase.wallet;
    setAztecAddr(azPhase.address);
    setAztecDropped(false);
    if (!isEth) {
      onAddress(azPhase.address);
      onWalletConnect?.(azPhase.wallet);
    }
    azAck();
  }, [azPhase, azAck, onAddress, isEth, onWalletConnect]);

  // Wallet dropped the link on its own side (extension closed / session lost).
  // A drop is asset-independent, so clear the dead Aztec session regardless of the
  // active tab; only the recipient form is asset-specific. disconnect() is our own path.
  useDeferredEffect(() => {
    if (azPhase.kind !== "disconnected") return;
    const dead = aztecAddr;
    clearAztecConnection();
    setAztecDropped(true);
    // Clear the form only if the dead wallet was driving it; preserve manual input.
    if (
      !isEth &&
      dead &&
      currentFormAddress &&
      currentFormAddress.trim().toLowerCase() === dead.toLowerCase()
    ) {
      onAddress("");
    }
    azAck(); // return the hook to idle
  }, [azPhase, isEth, aztecAddr, currentFormAddress, clearAztecConnection, onAddress, azAck]);

  // Only auto-clear while the hint is actually visible (!isEth), so a drop on the
  // ETH tab still surfaces when the user returns to the Aztec tab.
  useEffect(() => {
    if (!aztecDropped || isEth) return;
    const t = setTimeout(() => setAztecDropped(false), 6000);
    return () => clearTimeout(t);
  }, [aztecDropped, isEth]);

  // Picker click handler — applies the pick synchronously to bar state and the
  // parent form, then transitions phase. Avoids relying solely on the
  // connected-phase useEffect, which has missed the update in some flows.
  const handlePickAccount = useCallback(
    (addr: string) => {
      const wallet =
        azguard.phase.kind === "picking-account"
          ? azguard.phase.wallet
          : aztecWalletRef.current;
      aztecWalletRef.current = wallet;
      setAztecAddr(addr);
      if (!isEth) {
        onAddress(addr);
        if (wallet) onWalletConnect?.(wallet);
      }
      azguard.pickAccount(addr);
    },
    [azguard, isEth, onAddress, onWalletConnect],
  );

  const { providers: ethProviders } = useEthereumProviders();

  const attachProviderListeners = useCallback(
    (p: EthereumProvider) => {
      if (!p.on) return () => undefined;
      const accountsHandler = (...args: unknown[]) => {
        const accounts = args[0] as string[] | undefined;
        const next = accounts?.[0] ?? null;
        setEthAddr(next);
        writePersisted({ ...readPersisted(), eth: next });
        if (isEth) onAddress(next ?? "");
      };
      const chainHandler = (...args: unknown[]) => {
        setChainId(args[0] as string);
      };
      p.on("accountsChanged", accountsHandler);
      p.on("chainChanged", chainHandler);
      return () => {
        p.removeListener?.("accountsChanged", accountsHandler);
        p.removeListener?.("chainChanged", chainHandler);
      };
    },
    [onAddress, isEth],
  );

  // -32002 = "Already processing eth_requestAccounts" — user double-clicked
  // because they didn't see the first popup. Translate to actionable text.
  const friendlyEthError = (err: unknown): string => {
    const e = err as { code?: number; message?: string } | null;
    const code = e?.code;
    const msg = (e?.message ?? "").toLowerCase();
    if (code === -32002 || msg.includes("already pending") || msg.includes("already processing")) {
      return "A connection request is already pending in your wallet. Open the wallet popup (it may be hidden behind this window) and approve or reject it, then try again.";
    }
    if (code === 4001 || msg.includes("user rejected") || msg.includes("user denied")) {
      return "Connection cancelled in wallet.";
    }
    return e?.message || "Connection failed.";
  };

  // Fetch chainId in parallel with eth_requestAccounts so the wrong-chain
  // banner renders in the same paint as the connected address.
  const connectWithProvider = useCallback(
    async (announced: AnnouncedProvider) => {
      ethProviderRef.current = announced.provider;
      setEthError(null);
      setEthBusy(true);
      try {
        const [accountsResult, chainResult] = await Promise.all([
          announced.provider.request({ method: "eth_requestAccounts" }),
          announced.provider.request({ method: "eth_chainId" }).catch(() => null),
        ]);
        const addr = (accountsResult as string[] | undefined)?.[0] ?? null;
        if (!addr) {
          setEthError(`${announced.info.name} returned no accounts.`);
          return;
        }
        // Chain before address so wrongChain memo flips first; no "all good" flash.
        if (typeof chainResult === "string") setChainId(chainResult);
        setEthAddr(addr);
        writePersisted({
          ...readPersisted(),
          eth: addr,
          ethRdns: announced.info.rdns,
        });
        if (isEth) onAddress(addr);
      } catch (err) {
        setEthError(friendlyEthError(err));
      } finally {
        setEthBusy(false);
      }
    },
    [onAddress, isEth],
  );

  // Discovery: remembered rdns → single auto-pick → picker → legacy window.ethereum.
  const startEthConnect = useCallback(async () => {
    setEthError(null);
    refreshEthereumProviders();
    await new Promise((r) => setTimeout(r, 80));
    const list = getEthereumProviders();
    const persisted = readPersisted();

    if (persisted.ethRdns) {
      const remembered = list.find((p) => p.info.rdns === persisted.ethRdns);
      if (remembered) {
        await connectWithProvider(remembered);
        return;
      }
    }

    if (list.length === 1) {
      await connectWithProvider(list[0]);
      return;
    }
    if (list.length > 1) {
      setPickerOpen(true);
      return;
    }
    refreshEthereumProviders();
    await new Promise((r) => setTimeout(r, 250));
    const second = getEthereumProviders();
    if (second.length === 1) {
      await connectWithProvider(second[0]);
      return;
    }
    if (second.length > 1) {
      setPickerOpen(true);
      return;
    }
    const legacy = getLegacyEthereumProvider();
    if (legacy) {
      await connectWithProvider(legacy);
      return;
    }
    setEthError("No Ethereum wallet detected. Install MetaMask, Rabby, or another Web3 wallet and reload.");
  }, [connectWithProvider]);

  const onPickerSelect = useCallback(
    (p: AnnouncedProvider) => {
      setPickerOpen(false);
      void connectWithProvider(p);
    },
    [connectWithProvider],
  );

  const onPickerEmpty = useCallback(() => {
    setPickerOpen(false);
    setEthError("No Ethereum wallet detected. Install MetaMask, Rabby, or another Web3 wallet and reload.");
  }, []);

  useEffect(() => {
    const p = ethProviderRef.current;
    if (!p) return;
    return attachProviderListeners(p);
  }, [attachProviderListeners, ethAddr]);

  // No on-mount discovery: it would pop the extension's prompt on page load.
  // Discovery runs only after a wallet type is picked in the connect modal.

  // Multi-tab sync — without this, disconnecting in tab 1 leaves tab 2 stale.
  // Only ETH is persisted (the Aztec wallet lives in memory), so always sync
  // ethAddr but touch the recipient form only while ETH is the active asset.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readPersisted();
      setEthAddr(next.eth ?? null);
      if (isEth) onAddress(next.eth ?? "");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [isEth, onAddress]);

  // Hide the hint the moment the wallet is no longer busy.
  useOnValueChange(ethBusy, () => {
    if (!ethBusy) setShowBusyHint(false);
  });
  useEffect(() => {
    if (!ethBusy) return;
    const t = setTimeout(() => setShowBusyHint(true), 1500);
    return () => clearTimeout(t);
  }, [ethBusy]);

  // Silent reconciliation via eth_accounts (no popup). The bar unmounts during
  // a drip; accountsChanged doesn't fire while detached, so we verify on
  // remount. Handles: matching cache, switched account, revoked permission.
  useDeferredEffect(() => {
    const persisted = readPersisted();
    if (!persisted.ethRdns) return;
    const list = getEthereumProviders();
    const match =
      list.find((p) => p.info.rdns === persisted.ethRdns) ??
      getLegacyEthereumProvider();
    if (!match) {
      setEthAddr(null);
      writePersisted({ ...readPersisted(), eth: null, ethRdns: null });
      if (isEth) onAddress("");
      return;
    }
    ethProviderRef.current = match.provider;
    void Promise.all([
      match.provider.request({ method: "eth_accounts" }).catch(() => null),
      match.provider.request({ method: "eth_chainId" }).catch(() => null),
    ]).then(([accounts, chain]) => {
      if (typeof chain === "string") setChainId(chain);
      const addr = (accounts as string[] | undefined)?.[0] ?? null;
      if (addr) {
        setEthAddr(addr);
        writePersisted({ ...readPersisted(), eth: addr });
        if (isEth) onAddress(addr);
      } else {
        setEthAddr(null);
        writePersisted({ ...readPersisted(), eth: null, ethRdns: null });
        ethProviderRef.current = null;
        if (isEth && currentFormAddress) onAddress("");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEth, ethProviders.length]);

  // Asset toggle: push the new asset's stored address. Only clear the form
  // if the wallet was driving it; preserve manually-typed addresses.
  const lastAssetRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAssetRef.current === asset) return;
    const prevAsset = lastAssetRef.current;
    lastAssetRef.current = asset;
    const next = isEth ? ethAddr : aztecAddr;
    if (next !== null) {
      onAddress(next);
    } else {
      const oldWalletAddr = prevAsset === "eth" ? ethAddr : aztecAddr;
      const formWasDrivenByWallet =
        !!oldWalletAddr &&
        !!currentFormAddress &&
        currentFormAddress.toLowerCase() === oldWalletAddr.toLowerCase();
      if (formWasDrivenByWallet) {
        onAddress("");
      }
    }
  }, [asset, isEth, ethAddr, aztecAddr, onAddress, currentFormAddress]);

  // dApp-side disconnect only — can't revoke wallet permissions from here.
  const disconnect = useCallback(() => {
    if (isEth) {
      setEthAddr(null);
      setEthError(null);
      ethProviderRef.current = null;
      writePersisted({ ...readPersisted(), eth: null, ethRdns: null });
    } else {
      clearAztecConnection();
      azDisconnect(); // tear down the connected web wallet's floating panel
    }
    onAddress("");
  }, [isEth, onAddress, clearAztecConnection, azDisconnect]);

  // Expose disconnect so the layout can tear the wallet (and its floating panel)
  // down once an in-wallet claim completes.
  useEffect(() => {
    registerDisconnect?.(disconnect);
    return () => registerDisconnect?.(null);
  }, [registerDisconnect, disconnect]);

  const connectedAddr = isEth ? ethAddr : aztecAddr;
  const idleLabel = isEth ? "Connect Ethereum Wallet" : "Connect Aztec Wallet";

  const formMatchesWallet =
    !!connectedAddr &&
    !!currentFormAddress &&
    currentFormAddress.trim().toLowerCase() === connectedAddr.toLowerCase();

  const startWalletFlow = isEth ? startEthConnect : azguard.start;

  // Two-click confirm before overwriting a manually-typed address;
  // auto-resets after 2.5s.
  const [confirmReplace, setConfirmReplace] = useState(false);
  useEffect(() => {
    if (!confirmReplace) return;
    const t = setTimeout(() => setConfirmReplace(false), 2500);
    return () => clearTimeout(t);
  }, [confirmReplace]);
  // Pending confirm no longer applies once the wallet or match state moves.
  const replaceKey = `${connectedAddr ?? ""}|${formMatchesWallet}`;
  useOnValueChange(replaceKey, () => setConfirmReplace(false));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuWrapRef.current) return;
      if (e.target instanceof Node && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ETH: wallet_requestPermissions re-prompts account pick.
  // Aztec: no equivalent — clear and restart discovery.
  const switchAccount = useCallback(async () => {
    setMenuOpen(false);
    if (isEth) {
      const p = ethProviderRef.current;
      if (!p) {
        await startEthConnect();
        return;
      }
      try {
        await p.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
        const accounts = (await p.request({ method: "eth_accounts" })) as
          | string[]
          | undefined;
        const next = accounts?.[0] ?? null;
        if (next) {
          setEthAddr(next);
          writePersisted({ ...readPersisted(), eth: next });
          if (isEth) onAddress(next);
        }
      } catch (err) {
        setEthError(friendlyEthError(err));
      }
    } else {
      const wallet = aztecWalletRef.current;
      if (wallet) {
        try {
          const accounts = await wallet.getAccounts();
          const addrs = Array.from(accounts as unknown[])
            .map((a) => unwrapAddress(a))
            .filter((a): a is string => a !== null);
          if (addrs.length > 1) {
            azguard.enterAccountPicker(wallet, addrs);
            return;
          }
        } catch {
          // wallet may be stale — fall through to fresh discovery
        }
      }
      clearAztecConnection();
      onAddress(""); // clear the recipient form, mirroring disconnect
      azguard.start();
    }
  }, [isEth, startEthConnect, azguard, onAddress, clearAztecConnection]);

  const handleConnectedClick = () => setMenuOpen((v) => !v);
  const handleNonMatchingClick = () => {
    if (confirmReplace) {
      onAddress(connectedAddr!);
      setConfirmReplace(false);
    } else {
      setConfirmReplace(true);
    }
  };
  const handleClick = formMatchesWallet
    ? handleConnectedClick
    : connectedAddr
    ? handleNonMatchingClick
    : startWalletFlow;

  const disabled = isEth && ethBusy;

  // Wallets return chain ids in mixed case; normalize both sides.
  const expectedChainHex = `0x${Number(L1_CHAIN_ID).toString(16)}`;
  const wrongChain = isEth && !!ethAddr && chainId !== null && chainId.toLowerCase() !== expectedChainHex;

  // Code 4902 = chain not configured → fall back to wallet_addEthereumChain.
  //
  // Public RPC URLs only. Our server-side L1_RPC_URL has a private key and
  // the browser bundle.
  const switchToSepolia = useCallback(async () => {
    const p = ethProviderRef.current;
    if (!p) return;
    setEthError(null);
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: expectedChainHex }],
      });
    } catch (err) {
      const e = err as { code?: number; message?: string } | null;
      // 4902 = "Unrecognized chain ID. Try adding the chain first."
      const isUnknownChain =
        e?.code === 4902 ||
        (e?.message ?? "").toLowerCase().includes("unrecognized chain") ||
        (e?.message ?? "").toLowerCase().includes("not added");
      if (!isUnknownChain) {
        setEthError(friendlyEthError(err));
        return;
      }
      try {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: expectedChainHex,
              chainName: "Sepolia",
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [
                "https://ethereum-sepolia-rpc.publicnode.com",
                "https://rpc.sepolia.org",
              ],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        // Most wallets switch automatically after add, but we issue an
        // explicit switch for the ones that don't (and to refresh chainId
        // if the chainChanged listener was missed).
        try {
          await p.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: expectedChainHex }],
          });
        } catch {}
      } catch (addErr) {
        setEthError(friendlyEthError(addErr));
      }
    }
  }, [expectedChainHex]);

  // Auto-prompt Sepolia switch on wrong-chain detection (Uniswap pattern).
  useDeferredEffect(() => {
    if (!wrongChain) return;
    void switchToSepolia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongChain]);

  // One status line at a time; error > hint.
  const statusLine: { kind: "error" | "warn" | "hint"; text: string } | null =
    isEth && ethError
      ? { kind: "error", text: ethError }
      : showBusyHint && isEth
      ? { kind: "hint", text: "Check your wallet. The popup may be hidden behind this window." }
      : null;

  const connectedAriaLabel = formMatchesWallet
    ? `Wallet menu for ${connectedAddr}. Press Enter to open.`
    : connectedAddr
    ? `Use saved address ${connectedAddr}`
    : idleLabel;

  // In-wallet claim gate. When off, the Aztec connect is hidden and only ETH
  // (for L1 ETH drips) shows. The picker disables Azguard until it ships v5.
  if (!isEth && !IN_WALLET_CLAIM_ENABLED) return null;

  return (
    <div className="flex flex-col items-end gap-1" ref={menuWrapRef}>
      <div className="relative">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={`group flex min-w-52 items-center justify-center gap-2 border px-3 py-2 font-label text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 ${
            formMatchesWallet
              ? "border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/10"
              : "border-outline-variant bg-surface-high text-on-surface-variant hover:border-accent hover:text-accent"
          }`}
          title={
            formMatchesWallet
              ? "Account options"
              : connectedAddr
              ? `Click to use ${shortAddr(connectedAddr)}`
              : isEth
              ? "Connect an Ethereum wallet to auto-fill your address"
              : "Connect an Aztec wallet to auto-fill your address"
          }
          aria-label={connectedAriaLabel}
          aria-haspopup={formMatchesWallet ? "menu" : undefined}
          aria-expanded={formMatchesWallet ? menuOpen : undefined}
        >
          {formMatchesWallet ? (
            <>
              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0" aria-hidden="true">
                <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                <span
                  className="absolute inline-flex h-full w-full animate-ping bg-accent/60"
                  style={{ animationDuration: "2.5s" }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
              </span>
              <span className="font-mono">{shortAddr(connectedAddr!)}</span>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                <path
                  d="M2 5h12M2 5v6a1 1 0 001 1h10a1 1 0 001-1V5M2 5l1.5-2h9L14 5M11 8.5h.01"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {connectedAddr
                ? confirmReplace
                  ? "Confirm replace address?"
                  : `Use ${shortAddr(connectedAddr)}`
                : idleLabel}
            </>
          )}
        </button>

        {formMatchesWallet && menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-72 border border-outline-variant bg-surface shadow-2xl"
          >
            <div className="border-b border-outline-variant/50 px-4 py-3">
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">
                Connected
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-on-surface">
                {connectedAddr}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={switchAccount}
              className="flex w-full items-center gap-2 px-4 py-2.5 font-label text-[11px] uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-accent/5 hover:text-accent"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <path d="M5 4h7M5 4l-2 2 2 2M11 8h-7M11 8l2 2-2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Switch account
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                disconnect();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 font-label text-[11px] uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-red-500/5 hover:text-red-400"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <path d="M11 4l-4 4 4 4M3 8h8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Disconnect from this site
            </button>
            <p className="border-t border-outline-variant/50 px-4 py-2.5 font-label text-[10px] leading-relaxed text-on-surface-variant opacity-60">
              Disconnecting only clears the address from this page. To revoke
              site permissions entirely, manage them in your wallet extension.
            </p>
          </div>
        )}
      </div>

      {!connectedAddr && !statusLine && (
        <p
          className={`max-w-full text-right font-label text-[10px] leading-relaxed sm:max-w-xs ${
            !isEth && aztecDropped
              ? "text-on-surface-variant opacity-80"
              : "text-on-surface-variant opacity-50"
          }`}
        >
          {!isEth && aztecDropped
            ? "Wallet disconnected. Connect again to continue."
            : "Reads your address only. No signature, no transaction."}
        </p>
      )}

      {statusLine ? (
        <p
          role={statusLine.kind === "error" ? "alert" : undefined}
          className={`max-w-full text-right font-label text-[11px] leading-relaxed sm:max-w-xs wrap-break-word ${
            statusLine.kind === "error"
              ? "text-red-400"
              : "text-on-surface-variant opacity-70"
          }`}
        >
          {statusLine.text}
        </p>
      ) : wrongChain ? (
        <button
          type="button"
          onClick={switchToSepolia}
          className="max-w-full text-right font-label text-[11px] leading-relaxed text-amber-400 sm:max-w-xs hover:text-amber-300 wrap-break-word"
        >
          Wrong network. Switch to Sepolia →
        </button>
      ) : null}

      {isEth && (
        <EthereumWalletPicker
          open={pickerOpen}
          providers={ethProviders}
          onPick={onPickerSelect}
          onEmpty={onPickerEmpty}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {!isEth && (
        <WalletConnectModal
          phase={azguard.phase}
          pickProvider={azguard.pickProvider}
          confirm={azguard.confirm}
          reject={azguard.reject}
          reset={azguard.reset}
          beginDiscovery={azguard.beginDiscovery}
          pickAccount={handlePickAccount}
        />
      )}
    </div>
  );
}
