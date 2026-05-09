"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AnnouncedProvider } from "@/lib/ethereum-providers";

type Props = {
  open: boolean;
  providers: AnnouncedProvider[];
  // Called when discovery turned up nothing after the timeout. Lets the
  // parent surface "no wallet detected" guidance instead of a stuck modal.
  onEmpty?: () => void;
  onPick: (p: AnnouncedProvider) => void;
  onClose: () => void;
};

export function EthereumWalletPicker({ open, providers, onEmpty, onPick, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Wait briefly for late-announced wallets before bailing out. 500ms is
  // long enough for slow extensions to inject, short enough that the user
  // doesn't feel hung.
  useEffect(() => {
    if (!open || providers.length > 0) return;
    const t = setTimeout(() => {
      if (providers.length === 0) onEmpty?.();
    }, 500);
    return () => clearTimeout(t);
  }, [open, providers.length, onEmpty]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm border border-outline-variant bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface">
            Choose a wallet
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

        <div className="space-y-2">
          {providers.length === 0 ? (
            <p className="font-label text-xs text-on-surface-variant opacity-70">
              Looking for installed Ethereum wallets…
            </p>
          ) : (
            providers.map((p) => (
              <button
                key={p.info.uuid}
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 border border-outline-variant bg-surface-low px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5"
              >
                <ProviderIcon icon={p.info.icon} name={p.info.name} />
                <div className="min-w-0 text-left">
                  <p className="truncate font-label text-sm uppercase tracking-wider text-on-surface">
                    {p.info.name}
                  </p>
                  {p.info.rdns && p.info.rdns !== "legacy.ethereum" && (
                    <p className="truncate font-label text-[10px] uppercase tracking-wider text-on-surface-variant opacity-50">
                      {p.info.rdns}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <p className="pt-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">
          Approve the request in your wallet extension after picking
        </p>
      </div>
    </div>,
    document.body,
  );
}

function ProviderIcon({ icon, name }: { icon?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) {
    const letter = name.trim().charAt(0).toUpperCase() || "W";
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-accent/20 font-label text-sm font-bold text-accent">
        {letter}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt=""
      className="h-8 w-8 shrink-0 rounded-sm"
      onError={() => setBroken(true)}
    />
  );
}
