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
import { discoverWallets, getChainInfo } from "@/lib/wallet-client";
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
  // Exposes the live Wallet object upward so the parent can pass it to
  // WalletClaimButton for the skip-reconnect optimisation.
  onWalletConnect?: (wallet: Wallet | null) => void;
};

const STORAGE_KEY = "faucet:wallet-connections";

type Persisted = {
  aztec?: string | null;
  eth?: string | null;
  // Remember which Ethereum wallet (by EIP-6963 rdns) the user picked last
  // time so we can re-attach to the same one without re-prompting if they
  // come back. Falls back to a fresh picker if the rdns isn't announced.
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

export function WalletConnectBar({ asset, currentFormAddress = "", onAddress, onWalletConnect }: Props) {
  const isEth = asset === "eth";

  const [aztecAddr, setAztecAddr] = useState<string | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [ethBusy, setEthBusy] = useState(false);
  const [ethError, setEthError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Hint shown after the connect popup hasn't been resolved within ~1.5s.
  // Common case: MetaMask popup opens behind the main window on multi-
  // monitor setups and the user doesn't notice it's there.
  const [showBusyHint, setShowBusyHint] = useState(false);

  // The active Ethereum provider — the one we're talking to right now.
  // Pinned to a specific EIP-6963 announce, not window.ethereum, so when
  // the user has Rabby + MetaMask + Coinbase installed, calls go to the
  // wallet they actually picked, not whichever overwrote the global last.
  const ethProviderRef = useRef<EthereumProvider | null>(null);

  // Hydrate from localStorage on first render so the connect state survives
  // form-into-split remounts and quick tab navigations.
  //
  // ⚠️ React StrictMode runs effects twice in dev. The `hydrated` ref
  // guards against double-fire, which today is harmless because all we do
  // is read once and call setters with stable values. If you ever extend
  // this effect to perform side-effects beyond initial state seeding (e.g.
  // dispatch network calls, mutate persisted state, increment counters),
  // the StrictMode double-invoke WILL fire your new logic twice in dev
  // and you'll have a real bug. Either keep this effect strictly
  // idempotent, or move side-effects out of it.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const p = readPersisted();
    if (p.eth) setEthAddr(p.eth);
    // Aztec connections are not persisted across reloads (the Wallet object
    // doesn't survive a page load). Clear any stale aztec key written by
    // older versions of this code.
    if (p.aztec) writePersisted({ ...p, aztec: null });
  }, []);

  // ── Aztec / Azguard ────────────────────────────────────────────────────
  const azguard = useWalletConnect();

  useEffect(() => {
    if (azguard.phase.kind !== "connected") return;
    const addr = azguard.phase.address;
    const wallet = azguard.phase.wallet;
    setAztecAddr(addr);
    if (!isEth) {
      onAddress(addr);
      onWalletConnect?.(wallet);
    }
    azguard.reset();
  }, [azguard, onAddress, isEth, onWalletConnect]);

  // ── Ethereum (EIP-6963 + legacy fallback) ──────────────────────────────
  const { providers: ethProviders } = useEthereumProviders();

  // Wire account / chain change listeners onto whichever provider we're
  // currently using. Re-runs when we swap providers (e.g. user disconnects
  // MetaMask and picks Rabby).
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

  // Map common wallet RPC errors to friendlier messages. The big one we
  // care about is -32002 ("Already processing eth_requestAccounts"): users
  // who don't see the first popup (often hidden behind the main window on
  // multi-monitor setups) click again, and the second call rejects with
  // this opaque code. We translate it into actionable language.
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

  // Connect flow once a provider has been picked. Pulled out so both the
  // single-wallet auto-pick and the multi-wallet picker can call it.
  // Fetches the chain id in parallel with eth_requestAccounts so the
  // wrong-chain banner can render in the same paint as the connected
  // address — avoids a flicker where the address renders without the
  // warning for a few hundred ms.
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
        // Set chain first so the wrongChain memo flips before the address
        // memo and the user never sees an "all good" frame on a wrong-chain
        // wallet.
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

  // Entry point for the "Connect Ethereum Wallet" click.
  // Discovery rules:
  //  - If we previously connected to a known rdns and it's still announced,
  //    use it directly (no picker).
  //  - If exactly one provider is announced, auto-pick.
  //  - If multiple, open the picker.
  //  - If none, refresh + wait briefly. If still none, fall back to legacy
  //    window.ethereum if any (so users on old wallets aren't stranded).
  const startEthConnect = useCallback(async () => {
    setEthError(null);
    refreshEthereumProviders();
    // small wait so late-injected wallets get a chance to announce
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
    // No EIP-6963 providers seen. Try one more refresh + a longer wait,
    // then fall back to legacy window.ethereum.
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

  // Re-attach listeners whenever the underlying provider reference changes.
  useEffect(() => {
    const p = ethProviderRef.current;
    if (!p) return;
    return attachProviderListeners(p);
  }, [attachProviderListeners, ethAddr]);

  // Azguard presence probe.
  //
  // Azguard has no `accountsChanged` equivalent, so we can't react to
  // wallet-side disconnects in real time. Best we can do on mount is run
  // a short discovery probe: if Azguard doesn't announce within the
  // timeout, the wallet is uninstalled / disabled / on a different
  // network, and any cached aztec address is stale. Clear it.
  //
  // This catches:
  //   - Uninstall between sessions
  //   - Wallet disabled / different browser profile
  //   - Wallet switched to a different Aztec network
  // It does NOT catch session revocation inside Azguard while the
  // extension stays present — that surfaces only when the user clicks
  // something that requires the wallet (which then re-prompts).
  useEffect(() => {
    const persisted = readPersisted();
    if (!persisted.aztec) return;
    let cancelled = false;
    let seen = false;
    let session: { cancel: () => void } | null = null;
    const fallback = setTimeout(() => {
      if (cancelled || seen) return;
      // No Azguard announce within 5s — clear the stored aztec connection.
      setAztecAddr(null);
      writePersisted({ ...readPersisted(), aztec: null });
      if (!isEth) onAddress("");
    }, 5000);
    void (async () => {
      try {
        const chainInfo = await getChainInfo();
        if (cancelled) return;
        session = discoverWallets(
          chainInfo,
          () => {
            seen = true;
            clearTimeout(fallback);
            session?.cancel();
          },
          5000,
        );
      } catch {
        // If chainInfo fetch fails (offline / node down) we can't tell
        // whether the wallet is still there. Leave the cache alone — the
        // next user-driven action will sort it out.
        clearTimeout(fallback);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      session?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Multi-tab sync. If another faucet tab disconnects (or connects to a
  // different account), the storage event fires here. Without this,
  // closing in tab 1 leaves tab 2 stuck showing a stale "Connected" badge
  // and pre-filling the form with an address the user just disconnected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readPersisted();
      // Only reflect changes for the currently active asset's address —
      // changing the other one doesn't need to re-render the form.
      setEthAddr(next.eth ?? null);
      setAztecAddr(next.aztec ?? null);
      if (isEth) onAddress(next.eth ?? "");
      else onAddress(next.aztec ?? "");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [isEth, onAddress]);

  // Busy-hint timer. Show "Check your wallet — popup may be hidden behind
  // this window" 1.5s into a connect attempt. Cleared as soon as ethBusy
  // flips back to false (success or error).
  useEffect(() => {
    if (!ethBusy) {
      setShowBusyHint(false);
      return;
    }
    const t = setTimeout(() => setShowBusyHint(true), 1500);
    return () => clearTimeout(t);
  }, [ethBusy]);

  // Silent reconciliation with the wallet. Runs on every mount and
  // whenever the announced-providers list changes. Critically, this
  // does NOT depend on `isEth` — the bar is unmounted while the form is
  // in split mode (during a drip), and the user can disconnect / switch
  // accounts in their wallet during that 60s window. accountsChanged
  // doesn't fire if no listener is attached, so we have to verify
  // explicitly when the bar comes back.
  //
  // Three outcomes:
  //   a) wallet returns [addr] matching cache  → keep, refresh chain
  //   b) wallet returns [addr] DIFFERENT       → user switched accounts;
  //                                              adopt the new one
  //   c) wallet returns []                     → revoked; clear cache
  //
  // Uses `eth_accounts` (silent), not `eth_requestAccounts` (pops).
  useEffect(() => {
    const persisted = readPersisted();
    if (!persisted.ethRdns) return;
    const list = getEthereumProviders();
    const match =
      list.find((p) => p.info.rdns === persisted.ethRdns) ??
      getLegacyEthereumProvider();
    if (!match) {
      // Provider was remembered but is no longer available (extension
      // disabled, removed, or in a different browser profile). Clear the
      // stale state so the UI doesn't show a "Use 0x..." address the user
      // can no longer actually access.
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
      // Update chainId first so any wrong-chain warning paints in the
      // same render as the address, not in a follow-up tick.
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

  // When the user toggles between assets, push the *current asset's* stored
  // address into the form — but only if the wallet was driving the form or
  // we have an address for the new asset. Prevents the toggle from wiping
  // an address the user manually typed (which has no associated wallet).
  const lastAssetRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAssetRef.current === asset) return;
    const prevAsset = lastAssetRef.current;
    lastAssetRef.current = asset;
    const next = isEth ? ethAddr : aztecAddr;
    if (next !== null) {
      // New asset has a wallet address — use it.
      onAddress(next);
    } else {
      // No wallet for the new asset. Only clear the form if the wallet was
      // previously driving it (currentFormAddress matched the old wallet
      // address). If the user typed something different, leave it alone —
      // the type-mismatch validation will guide them instead.
      const prevIsEth = prevAsset === "eth";
      const oldWalletAddr = prevIsEth ? ethAddr : aztecAddr;
      const formWasDrivenByWallet =
        !!oldWalletAddr &&
        !!currentFormAddress &&
        currentFormAddress.toLowerCase() === oldWalletAddr.toLowerCase();
      if (formWasDrivenByWallet) {
        onAddress("");
      }
    }
  }, [asset, isEth, ethAddr, aztecAddr, onAddress, currentFormAddress]);

  // Local "forget" — clears the dApp's view of the connection. We can't
  // programmatically revoke a wallet's account permission (that's a
  // wallet-side action), so this is purely UI state.
  const disconnect = useCallback(() => {
    if (isEth) {
      setEthAddr(null);
      setEthError(null);
      ethProviderRef.current = null;
      writePersisted({ ...readPersisted(), eth: null, ethRdns: null });
    } else {
      setAztecAddr(null);
      onWalletConnect?.(null);
    }
    onAddress("");
  }, [isEth, onAddress, onWalletConnect]);

  const connectedAddr = isEth ? ethAddr : aztecAddr;
  const idleLabel = isEth ? "Connect Ethereum Wallet" : "Connect Aztec Wallet";

  // The button reflects the form's *effective* state, not just whether we
  // remember a wallet. If the user edits the input away from the wallet's
  // address, the wallet is no longer the source of truth → button flips
  // back to "Connect" so the UI doesn't lie.
  const formMatchesWallet =
    !!connectedAddr &&
    !!currentFormAddress &&
    currentFormAddress.trim().toLowerCase() === connectedAddr.toLowerCase();

  const startWalletFlow = isEth ? startEthConnect : azguard.start;

  // Two-click confirm before the "Use 0x..." button overwrites a manually-
  // typed address. First click flips `confirmReplace` → button label changes
  // to "Confirm replace?" and auto-resets after 2.5s if the user doesn't act.
  const [confirmReplace, setConfirmReplace] = useState(false);
  useEffect(() => {
    if (!confirmReplace) return;
    const t = setTimeout(() => setConfirmReplace(false), 2500);
    return () => clearTimeout(t);
  }, [confirmReplace]);
  // Reset when the wallet state changes (e.g., user disconnects mid-confirm).
  useEffect(() => {
    setConfirmReplace(false);
  }, [connectedAddr, formMatchesWallet]);

  // Click on the connected button opens a small menu (Switch account /
  // Disconnect / hint) instead of disconnecting outright. Single-click
  // disconnect was a misclick magnet — and there was no way to tell the
  // wallet to switch accounts without the user knowing to do it inside
  // the extension UI first.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on outside click or Escape.
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

  // Switch account.
  //  - ETH: wallet_requestPermissions with eth_accounts re-prompts the user
  //    to pick an account in MetaMask/Rabby/etc.
  //  - Aztec: no equivalent API; clear the stored connection and restart
  //    discovery so the user can reconnect (and pick a different account
  //    inside Azguard).
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
      // Aztec path: forget the current connection and re-run discovery.
      // User can pick a different account inside Azguard's UI.
      setAztecAddr(null);
      onWalletConnect?.(null);
      azguard.start();
    }
  }, [isEth, startEthConnect, azguard, onAddress]);

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

  // Sepolia chain id is L1_CHAIN_ID (decimal); wallets report 0x-prefixed hex.
  //
  // ⚠️ Format note for future Aztec chain id checks: EIP-1193 wallets are
  // *case-sensitive* about hex strings — MetaMask reports "0xaa36a7",
  // Coinbase Wallet has historically reported "0xAA36A7", and a strict
  // === would treat them as different chains. We toLowerCase() both
  // sides here. If you add an analogous comparison for the Aztec rollup
  // version / chain id, do not assume it's the same shape: Azguard and
  // other Aztec wallets may return raw bigints, decimal strings, or
  // 0x-prefixed hex without uniform casing. Normalize before compare.
  const expectedChainHex = `0x${Number(L1_CHAIN_ID).toString(16)}`;
  const wrongChain = isEth && !!ethAddr && chainId !== null && chainId.toLowerCase() !== expectedChainHex;

  // Switch to Sepolia. If the wallet doesn't have Sepolia configured at all
  // (returns code 4902), fall back to wallet_addEthereumChain with full
  // params, which most wallets implicitly switch to after adding.
  //
  // RPC URLs are intentionally public and key-less. Our server-side
  // L1_RPC_URL is an Alchemy URL with a private key and must NOT leak into
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
        } catch {
          // ignore — adding the chain is the meaningful step
        }
      } catch (addErr) {
        setEthError(friendlyEthError(addErr));
      }
    }
  }, [expectedChainHex]);

  // Auto-prompt the wallet to switch to Sepolia the moment we detect the
  // wrong chain — same UX pattern as Uniswap / most modern dApps. The user
  // sees a MetaMask (or equivalent) popup immediately rather than having to
  // notice and click the amber "Wrong network" link. We only fire once per
  // wrongChain transition; if the user rejects the prompt, they see the
  // manual link. ethError is cleared before the call so an old error doesn't
  // persist alongside the new prompt.
  useEffect(() => {
    if (wrongChain) void switchToSepolia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongChain]);

  // Show one status line at a time, error takes priority over wrong-chain.
  // Stacking two amber/red messages on top of each other was visually noisy
  // and gave the user no signal about which to act on first.
  const statusLine: { kind: "error" | "warn" | "hint"; text: string } | null =
    isEth && ethError
      ? { kind: "error", text: ethError }
      : showBusyHint && isEth
      ? { kind: "hint", text: "Check your wallet. The popup may be hidden behind this window." }
      : null;

  // The connected button needs a meaningful screen-reader label —
  // shortAddr alone reads as "0x1234 ellipsis abcd, button". The aria-label
  // describes the action (open menu) and identifies the account.
  const connectedAriaLabel = formMatchesWallet
    ? `Wallet menu for ${connectedAddr}. Press Enter to open.`
    : connectedAddr
    ? `Use saved address ${connectedAddr}`
    : idleLabel;

  return (
    <div className="flex flex-col items-end gap-1" ref={menuWrapRef}>
      <div className="relative">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          // min-w stops the bar from jumping width when the user toggles
          // between assets ("Connect Ethereum Wallet" is wider than
          // "Connect Aztec Wallet" which is wider than "0xabc…123 ⌄").
          // Stable width = no layout shift.
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
              {/* Two non-colour cues so colour-blind users get the same
                  signal as everyone else: a check icon (states "this is
                  the active connection") and a chevron (states "this
                  opens a menu"). The animated dot is purely decorative. */}
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

        {/* Account menu — only renders for the connected state. Closes on
            outside-click and Escape. Disconnect is no longer a single
            misclick away; it's an explicit menu item. */}
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

      {/* Value prop / safety caption. Shown only when the user is *not*
          connected — answers two questions at once:
          1. "Why bother? I can just paste an address." → saves the copy-paste.
          2. "Wait, what's it actually doing?" → reads address only,
             no signature, no funds touched. Explicitly calling this out
             reduces the trust friction users feel when a Web3 dApp asks
             for a wallet connection.
          When connected, the caption disappears — the green check + dot
          + visible address already conveys "we have what we need". */}
      {!connectedAddr && !statusLine && (
        <p className="max-w-full text-right font-label text-[10px] leading-relaxed text-on-surface-variant opacity-50 sm:max-w-xs">
          Reads your address only. No signature, no transaction.
        </p>
      )}

      {/* Single status line — show one message at a time (priority: error
          > busy-hint > wrong-chain). Stacking two amber/red messages was
          noisy and gave no signal about which to act on first.
          Mixed-case + leading-relaxed beats uppercase tracking-wider for
          longer error strings on small viewports — much more readable
          when the text wraps. Width caps at the bar's full width on
          narrow screens (sm:max-w-xs on wider). */}
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

      {/* Ethereum multi-wallet picker (only for ETH asset). */}
      {isEth && (
        <EthereumWalletPicker
          open={pickerOpen}
          providers={ethProviders}
          onPick={onPickerSelect}
          onEmpty={onPickerEmpty}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Aztec wallet picker (only for Fee Juice asset). */}
      {!isEth && (
        <WalletConnectModal
          phase={azguard.phase}
          pickProvider={azguard.pickProvider}
          confirm={azguard.confirm}
          reject={azguard.reject}
          reset={azguard.reset}
          start={azguard.start}
        />
      )}
    </div>
  );
}
