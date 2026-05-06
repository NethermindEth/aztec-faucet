"use client";

import { useEffect } from "react";
import { useWalletConnect } from "@/lib/use-wallet-connect";
import { WalletConnectModal } from "./wallet-connect-modal";

type Props = {
  onAddress: (address: string) => void;
};

export function ConnectWalletInline({ onAddress }: Props) {
  const { phase, start, pickProvider, confirm, reject, reset } = useWalletConnect();

  useEffect(() => {
    if (phase.kind === "connected") {
      onAddress(phase.address);
      reset();
    }
  }, [phase, onAddress, reset]);

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="flex items-center gap-1.5 border border-outline-variant bg-surface-high px-2 sm:px-3 py-1.5 font-label text-[10px] sm:text-[11px] uppercase tracking-wider text-on-surface-variant transition-all hover:border-accent hover:text-accent"
        title="Connect an Aztec wallet"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
          <path
            d="M2 5h12M2 5v6a1 1 0 001 1h10a1 1 0 001-1V5M2 5l1.5-2h9L14 5M11 8.5h.01"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Connect
      </button>
      <WalletConnectModal
        phase={phase}
        pickProvider={pickProvider}
        confirm={confirm}
        reject={reject}
        reset={reset}
      />
    </>
  );
}
