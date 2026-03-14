"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CopyButton, DataField, ClaimCommands } from "./drip-result";
import type { Network } from "@/lib/network-config";

type ClaimStatus = "bridging" | "ready" | "expired";

type ClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
};

type ClaimResponse = {
  status: ClaimStatus;
  elapsedSeconds: number;
  expiresInSeconds?: number;
  claimData?: ClaimData;
};

const POLL_INTERVAL_MS = 3_000;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="w-full rounded-xl border border-white/8 px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/15 hover:bg-white/4 hover:text-white"
    >
      Request another drip
    </button>
  );
}

const SEPOLIA_ETHERSCAN = "https://sepolia.etherscan.io/tx";

export function ClaimTracker({
  claimId,
  initialClaimData,
  l1TxHash,
  onReset,
  network = "devnet",
}: {
  claimId: string;
  initialClaimData?: ClaimData;
  l1TxHash?: string;
  onReset: () => void;
  network?: Network;
}) {
  const [status, setStatus] = useState<ClaimStatus>("bridging");
  const [elapsed, setElapsed] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  // Seed claimData from the drip response — available immediately without polling
  const [claimData, setClaimData] = useState<ClaimData | null>(initialClaimData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const startTimeRef = useRef(Date.now());

  const poll = useCallback(async () => {
    try {
      // Pass messageHash so the server can fall back to a stateless L2 node
      // check if the claim isn't in its local memory (multi-instance deployments).
      const msgHash = initialClaimData?.messageHashHex;
      const params = new URLSearchParams({ network });
      if (msgHash) params.set("messageHash", msgHash);
      const url = `/api/claim/${claimId}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          // If we have the L1 tx hash the bridge confirmed on-chain — keep polling
          // silently rather than showing an error. The claim may be on a different
          // server instance; it will resolve on the next poll cycle.
          if (!l1TxHash) {
            setError("Claim not found. It may have expired.");
            setStatus("expired");
          }
        }
        return;
      }

      const data: ClaimResponse = await res.json();
      setStatus(data.status);
      setElapsed(data.elapsedSeconds);

      if (data.status === "ready") {
        // claimData may be absent in stateless fallback responses — the initial
        // claimData seeded from the drip response is already in state.
        if (data.claimData) setClaimData(data.claimData);
        if (data.expiresInSeconds !== undefined) setExpiresIn(data.expiresInSeconds);
      }
    } catch {
      // Silently retry on network errors
    }
  }, [claimId, initialClaimData?.messageHashHex, network]);

  // Poll the backend while bridging
  useEffect(() => {
    if (status !== "bridging") return;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, poll]);

  // Local elapsed timer for smooth display
  useEffect(() => {
    if (status !== "bridging") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Countdown timer once claim is ready; flip to expired when it hits 0
  useEffect(() => {
    if (status !== "ready" || expiresIn === null) return;
    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev !== null && prev > 0) return prev - 1;
        setStatus("expired");
        return 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, expiresIn === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const expiryUrgent = expiresIn !== null && expiresIn < 300;
  const expiryCritical = expiresIn !== null && expiresIn < 60;

  // key={statusKey} forces remount → fires animate-panel-state-in on every transition
  const statusKey = error ? "error" : status;

  if (error || status === "expired") {
    const isError = !!error;
    return (
      <div key={statusKey} className="flex flex-col gap-5 animate-panel-state-in">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${isError ? "border-red-500/30 bg-red-500/10" : "border-orchid/30 bg-orchid/10"}`}>
              <svg viewBox="0 0 14 14" fill="none" className={`h-3.5 w-3.5 ${isError ? "text-red-400" : "text-orchid"}`}>
                <path d="M7 2v5M7 10.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {isError ? "Bridge Submitted" : "Claim Expired"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {isError
                  ? "The L1 bridge tx was sent. Status tracking failed. Use the data below to claim."
                  : "The L1→L2 message took too long. Please request Fee Juice again."}
              </p>
            </div>
          </div>

          {/* Show claim data even when polling fails — seeded from drip response */}
          {isError && claimData && (
            <div className="space-y-3">
              <DataField label="Claim Amount" value={claimData.claimAmount} />
              <DataField label="Message Leaf Index" value={claimData.messageLeafIndex} />
              <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAllFields((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <span className="text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-300">
                    Show all claim fields
                  </span>
                  <span className={`shrink-0 text-zinc-600 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${showAllFields ? "rotate-45" : ""}`}>
                    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ gridTemplateRows: showAllFields ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden min-h-0">
                    <div className="border-t border-white/6 px-3 pb-3 pt-2 space-y-2">
                      <DataField label="Claim Secret" value={claimData.claimSecretHex} />
                      <DataField label="Claim Secret Hash" value={claimData.claimSecretHashHex} />
                      <DataField label="Message Hash" value={claimData.messageHashHex} />
                    </div>
                  </div>
                </div>
              </div>
              <ClaimCommands
                claimAmount={claimData.claimAmount}
                claimSecretHex={claimData.claimSecretHex}
                messageLeafIndex={claimData.messageLeafIndex}
                network={network}
              />
            </div>
          )}
        </div>
        <ResetButton onReset={onReset} />
      </div>
    );
  }

  if (status === "bridging") {
    return (
      <div key={statusKey} className="flex flex-col gap-5 animate-panel-state-in">
        <div className="space-y-5">
          {/* Animated indicator */}
          <div className="flex items-center gap-3.5">
            <div className="relative h-7 w-7 shrink-0">
              <div className="absolute inset-0 animate-ping rounded-full bg-chartreuse/20" />
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-chartreuse/40 bg-chartreuse/10">
                <div className="h-2 w-2 animate-pulse rounded-full bg-chartreuse" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Bridging Fee Juice to L2...</p>
              <p className="mt-0.5 text-xs text-zinc-500">Initiating L1→L2 bridge deposit.</p>
            </div>
          </div>

          {/* Network row */}
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/2 px-3 py-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chartreuse/60" style={{ animationDuration: "1.5s" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-chartreuse" />
            </span>
            <span className="text-xs text-zinc-400">Aztec L2 {network === "testnet" ? "Testnet" : "Devnet"}</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-600">
              <span>Broadcasting</span>
              <span className="font-mono">{formatElapsed(elapsed)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full animate-pulse rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min((elapsed / 120) * 100, 95)}%`,
                  background: "color-mix(in srgb, var(--accent) 75%, transparent)",
                }}
              />
            </div>
          </div>

          <p className="text-xs text-zinc-600">
            This usually takes 1-2 minutes. Please don&apos;t close this tab.
          </p>

          {l1TxHash && (
            <a
              href={`${SEPOLIA_ETHERSCAN}/${l1TxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-chartreuse/60 transition-colors hover:text-chartreuse"
            >
              <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3 shrink-0">
                <path d="M6 2H2.5A.5.5 0 002 2.5v9a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V8M8.5 2H12v3.5M12 2L6.5 7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              View L1 bridge transaction on Sepolia
            </a>
          )}
        </div>
      </div>
    );
  }

  // status === "ready"
  return (
    <div key={statusKey} className="flex flex-col gap-5 animate-panel-state-in">
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aqua/30 bg-aqua/10">
              <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-aqua">
                <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Fee Juice Ready</span>
          </div>
          <span className="rounded-full border border-aqua/20 bg-aqua/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-aqua">
            Ready to Claim
          </span>
        </div>

        {/* Network row with expiry */}
        <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/2 px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orchid/60" style={{ animationDuration: "2.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orchid" />
          </span>
          <span className="text-xs text-zinc-400">Aztec L2 {network === "testnet" ? "Testnet" : "Devnet"}</span>
          {expiresIn !== null && (
            <span className={`ml-auto font-mono text-xs ${expiryCritical ? "text-red-400 font-semibold" : "text-red-400"}`}>
              {expiresIn === 0 ? "Expired" : `Expires ${formatElapsed(expiresIn)}`}
            </span>
          )}
        </div>

        {/* Claim data fields */}
        {claimData && (
          <div className="space-y-2">
            <DataField label="Claim Amount" value={claimData.claimAmount} />
            <DataField label="Message Leaf Index" value={claimData.messageLeafIndex} />
            <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAllFields((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-300">
                  Show all claim fields
                </span>
                <span className={`shrink-0 text-zinc-600 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${showAllFields ? "rotate-45" : ""}`}>
                  <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ gridTemplateRows: showAllFields ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden min-h-0">
                  <div className="border-t border-white/6 px-3 pb-3 pt-2 space-y-2">
                    <DataField label="Claim Secret" value={claimData.claimSecretHex} />
                    <DataField label="Claim Secret Hash" value={claimData.claimSecretHashHex} />
                    <DataField label="Message Hash" value={claimData.messageHashHex} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {claimData && (
          <ClaimCommands
            claimAmount={claimData.claimAmount}
            claimSecretHex={claimData.claimSecretHex}
            messageLeafIndex={claimData.messageLeafIndex}
            network={network}
          />
        )}
      </div>

      {l1TxHash && (
        <a
          href={`${SEPOLIA_ETHERSCAN}/${l1TxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3 shrink-0">
            <path d="M6 2H2.5A.5.5 0 002 2.5v9a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V8M8.5 2H12v3.5M12 2L6.5 7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View L1 bridge transaction on Sepolia
        </a>
      )}

      {/* Reset button pinned to bottom */}
      <ResetButton onReset={onReset} />
    </div>
  );
}
