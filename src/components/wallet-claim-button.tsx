"use client";

import { useEffect, useState } from "react";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { useWalletConnect } from "@/lib/use-wallet-connect";
import { WalletConnectModal } from "./wallet-connect-modal";
import { claimFeeJuiceViaWallet, type ClaimDataInput } from "@/lib/claim-via-wallet";
import { EXPLORER_TX_URL } from "@/lib/network-config";

type ClaimState =
  | { kind: "none" }
  | { kind: "claiming"; address: string }
  | { kind: "success"; txHash: string }
  | { kind: "error"; message: string };

type Props = {
  claimData: ClaimDataInput;
};

export function WalletClaimButton({ claimData }: Props) {
  const { phase, start, pickProvider, confirm, reject, reset } = useWalletConnect();
  const [claim, setClaim] = useState<ClaimState>({ kind: "none" });

  useEffect(() => {
    if (phase.kind !== "connected" || claim.kind !== "none") return;
    const wallet: Wallet = phase.wallet;
    const address = phase.address;
    setClaim({ kind: "claiming", address });
    void (async () => {
      try {
        const result = await claimFeeJuiceViaWallet(wallet, address, claimData);
        setClaim({ kind: "success", txHash: result.txHash });
      } catch (err) {
        setClaim({
          kind: "error",
          message: err instanceof Error ? err.message : "Claim failed",
        });
      } finally {
        reset();
      }
    })();
  }, [phase, claim.kind, claimData, reset]);

  const closeClaim = () => setClaim({ kind: "none" });

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="btn-primary w-full py-2.5 text-sm uppercase tracking-wider"
      >
        Claim in wallet
      </button>
      <WalletConnectModal
        phase={phase}
        pickProvider={pickProvider}
        confirm={confirm}
        reject={reject}
        reset={reset}
      />
      {claim.kind === "claiming" && (
        <Modal title="Claiming Fee Juice" onClose={() => undefined}>
          <p className="font-label text-xs text-on-surface-variant opacity-70">
            Approve the transaction in your wallet. Proving may take ~10s.
          </p>
          <p className="mt-2 break-all font-label text-[10px] text-on-surface-variant opacity-50">
            From: {claim.address}
          </p>
        </Modal>
      )}
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
      {claim.kind === "error" && (
        <Modal title="Claim failed" onClose={closeClaim}>
          <p className="font-label text-xs text-red-400">{claim.message}</p>
          <button
            type="button"
            onClick={closeClaim}
            className="btn-ghost mt-3 w-full py-2 text-xs uppercase"
          >
            Close
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
