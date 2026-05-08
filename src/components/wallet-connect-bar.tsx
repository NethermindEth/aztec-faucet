"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletConnect } from "@/lib/use-wallet-connect";
import { WalletConnectModal } from "./wallet-connect-modal";
import { L1_CHAIN_ID } from "@/lib/network-config";

type Props = {
  asset: string;
  // What's *currently* in the form's address input. Used to decide whether
  // the connected wallet is actually the source of truth for the form. If
  // the user edits the input away from the wallet's address, the bar flips
  // back to "Connect" — clicking it re-fills the form from the stored
  // wallet address (no popup needed when one is already saved).
  currentFormAddress?: string;
  onAddress: (address: string) => void;
};

const STORAGE_KEY = "faucet:wallet-connections";

type Persisted = {
  aztec?: string | null;
  eth?: string | null;
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

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

export function WalletConnectBar({ asset, currentFormAddress = "", onAddress }: Props) {
  const isEth = asset === "eth";

  // Per-wallet address state, kept independently so switching between Fee
  // Juice / ETH preserves both connections instead of forcing the user to
  // reconnect every time.
  const [aztecAddr, setAztecAddr] = useState<string | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [ethBusy, setEthBusy] = useState(false);
  const [ethError, setEthError] = useState<string | null>(null);

  // Hydrate from localStorage on first render so the connect state survives
  // form-into-split remounts and quick tab navigations.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const p = readPersisted();
    if (p.aztec) setAztecAddr(p.aztec);
    if (p.eth) setEthAddr(p.eth);
  }, []);

  // ── Aztec / Azguard ────────────────────────────────────────────────────
  const azguard = useWalletConnect();

  useEffect(() => {
    if (azguard.phase.kind !== "connected") return;
    const addr = azguard.phase.address;
    setAztecAddr(addr);
    writePersisted({ ...readPersisted(), aztec: addr });
    if (!isEth) onAddress(addr);
    azguard.reset();
  }, [azguard, onAddress, isEth]);

  // ── MetaMask ───────────────────────────────────────────────────────────
  const refreshChain = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    try {
      const id = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(id);
    } catch {
      // ignore — provider may not be ready
    }
  }, []);

  const connectMetaMask = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setEthError("MetaMask not detected. Install the extension and reload.");
      return;
    }
    setEthError(null);
    setEthBusy(true);
    try {
      const result = (await eth.request({ method: "eth_requestAccounts" })) as
        | string[]
        | undefined;
      const addr = result?.[0] ?? null;
      if (addr) {
        setEthAddr(addr);
        writePersisted({ ...readPersisted(), eth: addr });
        if (isEth) onAddress(addr);
        await refreshChain();
      } else {
        setEthError("MetaMask returned no accounts.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection cancelled";
      setEthError(msg);
    } finally {
      setEthBusy(false);
    }
  }, [onAddress, refreshChain, isEth]);

  // Listen for MetaMask account / chain changes.
  useEffect(() => {
    const eth = getEthereum();
    if (!eth?.on) return;
    const accountsHandler = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      const next = accounts?.[0] ?? null;
      setEthAddr(next);
      writePersisted({ ...readPersisted(), eth: next });
      // If the user disconnected via the extension UI, clear the form too
      // (only when ETH is the active asset — otherwise we'd nuke a valid
      // Aztec address the user is looking at).
      if (!next && isEth) onAddress("");
      else if (next && isEth) onAddress(next);
    };
    const chainHandler = (...args: unknown[]) => {
      setChainId(args[0] as string);
    };
    eth.on("accountsChanged", accountsHandler);
    eth.on("chainChanged", chainHandler);
    return () => {
      eth.removeListener?.("accountsChanged", accountsHandler);
      eth.removeListener?.("chainChanged", chainHandler);
    };
  }, [onAddress, isEth]);

  // Refresh chain id on first mount (we may already be connected from a
  // prior session) and whenever the active asset flips to ETH.
  useEffect(() => {
    if (isEth) void refreshChain();
  }, [isEth, refreshChain]);

  // When the user toggles between assets, push the *current asset's* stored
  // address into the form. Prevents a stale Aztec address from sticking
  // around after the user clicks "ETH" — and vice versa.
  const lastAssetRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAssetRef.current === asset) return;
    lastAssetRef.current = asset;
    const next = isEth ? ethAddr : aztecAddr;
    onAddress(next ?? "");
  }, [asset, isEth, ethAddr, aztecAddr, onAddress]);

  // Local "forget" — clears the dApp's view of the connection. We can't
  // programmatically revoke MetaMask's account permission (wallet-side
  // action), so this is purely UI state.
  const disconnect = useCallback(() => {
    if (isEth) {
      setEthAddr(null);
      setEthError(null);
      writePersisted({ ...readPersisted(), eth: null });
    } else {
      setAztecAddr(null);
      writePersisted({ ...readPersisted(), aztec: null });
    }
    onAddress("");
  }, [isEth, onAddress]);

  const connectedAddr = isEth ? ethAddr : aztecAddr;
  const idleLabel = isEth ? "Connect MetaMask" : "Connect Aztec Wallet";

  // The button reflects the form's *effective* state, not just whether we
  // remember a wallet. If the user manually edits the input to something
  // different from the wallet's address, the wallet is no longer the source
  // of truth → button flips back to "Connect" so the UI doesn't lie.
  const formMatchesWallet =
    !!connectedAddr &&
    !!currentFormAddress &&
    currentFormAddress.trim().toLowerCase() === connectedAddr.toLowerCase();

  // Click behaviour:
  //  - If form matches wallet → disconnect (clears form + forgets stored addr)
  //  - If wallet stored but form drifted → re-sync the form (no popup needed,
  //    we already have the address from a prior connect)
  //  - Otherwise → run the wallet flow (MetaMask popup or Aztec discovery)
  const startWalletFlow = isEth ? connectMetaMask : azguard.start;
  const handleClick = formMatchesWallet
    ? disconnect
    : connectedAddr
    ? () => onAddress(connectedAddr)
    : startWalletFlow;

  const disabled = isEth && ethBusy;

  // Sepolia chain id is L1_CHAIN_ID (decimal); MetaMask reports as 0x-prefixed hex.
  const expectedChainHex = `0x${Number(L1_CHAIN_ID).toString(16)}`;
  const wrongChain = isEth && !!ethAddr && chainId !== null && chainId.toLowerCase() !== expectedChainHex;

  const switchToSepolia = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: expectedChainHex }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Switch failed";
      setEthError(msg);
    }
  }, [expectedChainHex]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`group flex items-center gap-2 border px-3 py-2 font-label text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 ${
          formMatchesWallet
            ? "border-accent/40 bg-accent/5 text-accent hover:border-red-400/60 hover:bg-red-500/5 hover:text-red-400"
            : "border-outline-variant bg-surface-high text-on-surface-variant hover:border-accent hover:text-accent"
        }`}
        title={
          formMatchesWallet
            ? "Click to disconnect"
            : connectedAddr
            ? `Click to use ${shortAddr(connectedAddr)}`
            : isEth
            ? "Connect MetaMask to auto-fill your Ethereum address"
            : "Connect an Aztec wallet to auto-fill your address"
        }
      >
        {formMatchesWallet ? (
          <>
            <span className="relative flex h-1.5 w-1.5 group-hover:hidden">
              <span
                className="absolute inline-flex h-full w-full animate-ping bg-accent/60"
                style={{ animationDuration: "2.5s" }}
              />
              <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
            </span>
            <svg viewBox="0 0 16 16" fill="none" className="hidden h-3 w-3 group-hover:block">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="font-mono">{shortAddr(connectedAddr!)}</span>
            <span className="hidden font-label group-hover:inline">Disconnect</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
              <path
                d="M2 5h12M2 5v6a1 1 0 001 1h10a1 1 0 001-1V5M2 5l1.5-2h9L14 5M11 8.5h.01"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {connectedAddr ? `Use ${shortAddr(connectedAddr)}` : idleLabel}
          </>
        )}
      </button>

      {/* Wrong-chain warning. Don't block anything — the drip endpoint is
          server-side, so a wrong-chain wallet doesn't break the faucet, but
          if the user wants to use this wallet for downstream actions
          (bridging, sending, etc.) they should be on Sepolia. */}
      {wrongChain && (
        <button
          type="button"
          onClick={switchToSepolia}
          className="font-label text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300"
        >
          Wrong network — switch to Sepolia →
        </button>
      )}

      {ethError && isEth && (
        <p className="max-w-xs text-right font-label text-[10px] uppercase tracking-wider text-red-400">
          {ethError}
        </p>
      )}

      {/* Only mount the Aztec wallet picker when Fee Juice is active. Avoids
          triggering Aztec discovery in the background when the user only
          cares about ETH. */}
      {!isEth && (
        <WalletConnectModal
          phase={azguard.phase}
          pickProvider={azguard.pickProvider}
          confirm={azguard.confirm}
          reject={azguard.reject}
          reset={azguard.reset}
        />
      )}
    </div>
  );
}
