"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ConnectPhase } from "@/lib/use-wallet-connect";

function splitEmojis(joined: string): string[] {
  return Array.from(joined);
}

type Props = {
  phase: ConnectPhase;
  pickProvider: (p: import("@/lib/wallet-client").WalletProvider) => void;
  confirm: () => void;
  reject: () => void;
  reset: () => void;
  // Called once the wallet returns an address. Modal hides itself after.
  onConnected?: (address: string) => void;
};

export function WalletConnectModal({ phase, pickProvider, confirm, reject, reset, onConnected }: Props) {
  if (phase.kind === "idle") return null;

  if (phase.kind === "connected") {
    onConnected?.(phase.address);
    return null;
  }

  if (phase.kind === "discovering") {
    return (
      <Modal title="Choose a wallet" onClose={reset}>
        <div className="space-y-2">
          {phase.providers.length === 0 ? (
            <p className="font-label text-xs text-on-surface-variant opacity-70">
              Looking for installed wallets...
            </p>
          ) : (
            phase.providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProvider(p)}
                className="flex w-full items-center gap-3 border border-outline-variant bg-surface-low px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5"
              >
                {p.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.icon} alt="" className="h-6 w-6 rounded-sm" />
                )}
                <span className="font-label text-sm uppercase tracking-wider text-on-surface">
                  {p.name}
                </span>
              </button>
            ))
          )}
          <p className="pt-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">
            Approve the request in your wallet extension
          </p>
        </div>
      </Modal>
    );
  }

  if (phase.kind === "connecting") {
    return (
      <Modal title={`Connecting to ${phase.provider.name}`} onClose={reset}>
        <p className="font-label text-xs text-on-surface-variant opacity-70">
          Establishing secure channel...
        </p>
      </Modal>
    );
  }

  if (phase.kind === "verifying") {
    return (
      <Modal title="Verify connection" onClose={reject}>
        <p className="mb-3 font-label text-[11px] text-on-surface-variant opacity-70">
          Check that these emojis match what your wallet shows:
        </p>
        <div className="grid grid-cols-3 gap-2 border border-outline-variant bg-surface-low p-3">
          {splitEmojis(phase.emojis).map((emoji, i) => (
            <div key={i} className="flex aspect-square items-center justify-center text-3xl">
              {emoji}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reject} className="btn-ghost flex-1 py-2 text-xs uppercase">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="btn-primary flex-1 py-2 text-xs uppercase">
            Emojis match
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Something went wrong" onClose={reset}>
      <p className="font-label text-xs text-red-400">{phase.message}</p>
      <button type="button" onClick={reset} className="btn-ghost mt-3 w-full py-2 text-xs uppercase">
        Close
      </button>
    </Modal>
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
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
    </div>,
    document.body,
  );
}
