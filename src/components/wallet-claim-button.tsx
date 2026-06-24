"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { useWalletConnect } from "@/lib/use-wallet-connect";
import { WalletConnectModal } from "./wallet-connect-modal";
import { claimFeeJuiceViaWallet, type ClaimDataInput } from "@/lib/claim-via-wallet";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { EXPLORER_TX_URL } from "@/lib/network-config";

type ClaimState =
  | { kind: "none" }
  | { kind: "claiming"; address: string }
  | { kind: "success"; txHash: string }
  | { kind: "error"; message: string };

type Props = {
  claimData: ClaimDataInput;
  recipient: string;
  onClaimComplete?: (txHash: string) => void;
  // If set, skip the connect modal and claim directly with this wallet —
  // avoids the duplicate requestCapabilities popup.
  preConnectedWallet?: Wallet;
  preConnectedAddress?: string;
};

function shortAddr(addr: string): string {
  if (!addr.startsWith("0x") || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function WalletClaimButton({ claimData, recipient, onClaimComplete, preConnectedWallet, preConnectedAddress }: Props) {
  const { phase, start, beginDiscovery, pickProvider, confirm, reject, reset, disconnectWallet, pickAccount } = useWalletConnect();
  const [claim, setClaim] = useState<ClaimState>({ kind: "none" });
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  const canSkipConnect =
    preConnectedWallet !== undefined &&
    preConnectedAddress !== undefined &&
    preConnectedAddress.toLowerCase() === recipient.toLowerCase();

  useEffect(() => {
    if (!infoOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [infoOpen]);

  // The wallet just connected: kick off the claim on its own.
  useDeferredEffect(() => {
    if (canSkipConnect) return;
    if (phase.kind !== "connected" || claim.kind !== "none") return;
    const wallet: Wallet = phase.wallet;
    const address = phase.address;

    if (recipient && address.toLowerCase() !== recipient.toLowerCase()) {
      setClaim({
        kind: "error",
        message:
          `This drip was sent to ${shortAddr(recipient)} but the connected wallet account is ${shortAddr(address)}. ` +
          `Switch to the wallet account that controls ${shortAddr(recipient)}, or request a fresh drip for ${shortAddr(address)}.`,
      });
      disconnectWallet();
      return;
    }

    setClaim({ kind: "claiming", address });
    void (async () => {
      try {
        const result = await claimFeeJuiceViaWallet(wallet, address, claimData, recipient);
        setClaim({ kind: "success", txHash: result.txHash });
        onClaimComplete?.(result.txHash);
      } catch (err) {
        setClaim({
          kind: "error",
          message: err instanceof Error ? err.message : "Claim failed",
        });
      } finally {
        disconnectWallet();
      }
    })();
  }, [phase, claim.kind, claimData, recipient, disconnectWallet, onClaimComplete, canSkipConnect]);

  // Wallet dropped its own side during connect/claim: surface it and clear the
  // parked phase. An in-flight claim sets its own error, so don't clobber it.
  useDeferredEffect(() => {
    if (phase.kind !== "disconnected") return;
    setClaim((c) => (c.kind === "claiming" ? c : { kind: "error", message: "Wallet disconnected. Reconnect and try again." }));
    reset();
  }, [phase, reset]);

  // Direct-claim path: used when the header bar wallet is already connected
  // to the right account. No requestCapabilities popup — just the tx popup.
  const handlePreConnectedClaim = useCallback(async () => {
    if (!canSkipConnect || claim.kind === "claiming") return;
    setClaim({ kind: "claiming", address: preConnectedAddress! });
    try {
      const result = await claimFeeJuiceViaWallet(preConnectedWallet!, preConnectedAddress!, claimData, recipient);
      setClaim({ kind: "success", txHash: result.txHash });
      onClaimComplete?.(result.txHash);
    } catch (err) {
      setClaim({
        kind: "error",
        message: err instanceof Error ? err.message : "Claim failed",
      });
    }
  }, [canSkipConnect, claim.kind, preConnectedWallet, preConnectedAddress, claimData, recipient, onClaimComplete]);

  const closeClaim = () => setClaim({ kind: "none" });

  return (
    <>
      {(claim.kind === "none" || claim.kind === "claiming") && (
        <div className="relative flex gap-2">
          <button
            type="button"
            onClick={canSkipConnect ? handlePreConnectedClaim : start}
            disabled={claim.kind === "claiming"}
            className="btn-primary flex-1 py-2.5 text-sm uppercase tracking-wider disabled:opacity-60"
          >
            {claim.kind === "claiming" ? "Approve in wallet…" : "Claim in wallet"}
          </button>

          <div ref={infoRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              aria-label="Claim details"
              className="h-full px-3 border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-accent transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M8 7v4M8 5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {infoOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-72 border border-outline-variant bg-surface p-3 z-10 shadow-xl">
                {recipient && (
                  <>
                    <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant opacity-50 mb-1">
                      Claiming to
                    </p>
                    <p className="break-all font-mono text-[11px] text-on-surface mb-2">
                      {recipient}
                    </p>
                  </>
                )}
                <p className="font-label text-[10px] leading-relaxed text-on-surface-variant opacity-70">
                  Connect the wallet that controls this account. Proving may take ~10s after you approve.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {claim.kind === "error" && (
        <div className="border border-red-400/40 bg-red-500/5 px-4 py-3">
          <p className="font-label text-[10px] font-bold uppercase tracking-widest text-red-400">
            Claim failed
          </p>
          <p className="mt-1.5 font-label text-xs leading-relaxed text-red-400/90 wrap-break-word">
            {claim.message}
          </p>
          <button
            type="button"
            onClick={closeClaim}
            className="btn-ghost mt-3 w-full py-2 text-[10px] uppercase tracking-widest"
          >
            Try again
          </button>
        </div>
      )}

      <WalletConnectModal
        phase={phase}
        pickProvider={pickProvider}
        confirm={confirm}
        reject={reject}
        reset={reset}
        beginDiscovery={beginDiscovery}
        pickAccount={pickAccount}
      />
      {claim.kind === "success" && (
        <Modal title="Claim complete" onClose={closeClaim}>
          <p className="font-label text-xs text-on-surface-variant">
            Fee Juice has been claimed to your wallet account.
          </p>
          {claim.txHash && (
            <a
              href={`${EXPLORER_TX_URL}/${claim.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block break-all border border-outline-variant bg-surface-low px-3 py-2 font-label text-[11px] text-accent hover:bg-accent/5"
            >
              View on explorer: {claim.txHash.slice(0, 18)}...{claim.txHash.slice(-8)}
            </a>
          )}
          <button
            type="button"
            onClick={closeClaim}
            className="btn-primary mt-3 w-full py-2 text-xs uppercase"
          >
            Done
          </button>
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm border border-outline-variant bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant opacity-50 hover:opacity-100"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
