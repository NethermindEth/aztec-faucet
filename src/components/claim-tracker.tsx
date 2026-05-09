"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { Wallet } from "@aztec/aztec.js/wallet";
import { DataField, ClaimCommands, ClaimCompletePanel } from "./drip-result";

const WalletClaimButton = dynamic(
  () => import("./wallet-claim-button").then((m) => m.WalletClaimButton),
  { ssr: false },
);

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
  // Absolute expiry timestamp (ms). When present, the client uses this
  // to drive a local countdown that survives transient 404s — e.g. the
  // server pruning the claim record while the user is still on the page.
  expiresAt?: number;
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
      className="btn-primary w-full py-2.5 text-sm uppercase"
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
  recipient,
  onReset,
  onProgressChange,
  connectedWallet,
  connectedAddress,
}: {
  claimId: string;
  initialClaimData?: ClaimData;
  l1TxHash?: string;
  // The Aztec address the drip was sent to. Only this account can claim
  // the bridge message — passed through to WalletClaimButton for the
  // pre-flight wallet/recipient match check, and rendered in the UI so
  // the user can sanity-check before connecting any wallet.
  recipient: string;
  onReset: () => void;
  onProgressChange?: (progress: number, isReady: boolean) => void;
  connectedWallet?: Wallet;
  connectedAddress?: string;
}) {
  const [status, setStatus] = useState<ClaimStatus>("bridging");
  const [elapsed, setElapsed] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  // Absolute expiry timestamp learned from the API. Survives 404s from
  // the server (multi-instance miss, restart, pruning). Stored in a ref
  // because we read it inside the poll callback and don't need re-renders
  // when it updates — the poll loop reads the latest value on each tick.
  const expiresAtRef = useRef<number | null>(null);
  // Seed claimData from the drip response — available immediately without polling
  const [claimData, setClaimData] = useState<ClaimData | null>(initialClaimData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  // Once the wallet-side claim completes, collapse the wallet button + CLI
  // section into a "claim complete" panel. Bridge message is nullified at
  // that point so the CLI fallback would no longer work anyway.
  const [walletClaimedTx, setWalletClaimedTx] = useState<string | null>(null);
  const startTimeRef = useRef(Date.now());

  const poll = useCallback(async () => {
    try {
      // Pass messageHash so the server can fall back to a stateless L2 node
      // check if the claim isn't in its local memory (multi-instance deployments).
      const msgHash = initialClaimData?.messageHashHex;
      const params = new URLSearchParams();
      if (msgHash) params.set("messageHash", msgHash);
      const qs = params.toString();
      const url = `/api/claim/${claimId}${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 410) {
          // 410 Gone — server confirms the claim is expired. Definitive.
          setError("This drip has expired. Each Fee Juice drip stays valid for 30 minutes after the bridge becomes ready.");
          setStatus("expired");
          return;
        }
        if (res.status === 404) {
          // 404 — server doesn't know this id. Could be a multi-instance
          // miss (the drip went to pod A, this poll hit pod B), pruned
          // past the retention window, or a server restart that lost
          // in-memory state.
          //
          // If we have the L1 tx hash, keep polling silently — the
          // stateless fallback should resolve it once the L2 indexer
          // catches up.
          //
          // If we have a *local* expiresAtRef, trust the local clock:
          // showing the countdown is still useful even when the server
          // has forgotten us. Only declare expiry once the local clock
          // says we're past it.
          if (l1TxHash) return;
          if (expiresAtRef.current !== null && Date.now() < expiresAtRef.current) {
            // Server forgot us, but we know the claim hasn't expired
            // locally yet. Keep showing the existing state and let the
            // next tick try again.
            return;
          }
          setError("This drip has expired. Each Fee Juice drip stays valid for 30 minutes after the bridge becomes ready.");
          setStatus("expired");
        }
        return;
      }

      const data: ClaimResponse = await res.json();
      setStatus(data.status);
      setElapsed(data.elapsedSeconds);

      // Anchor the local expiry timestamp once we learn it. Subsequent
      // 404s (server restart, pod miss) can then be evaluated against
      // the local clock instead of giving up immediately.
      if (data.expiresAt !== undefined) expiresAtRef.current = data.expiresAt;

      if (data.status === "ready") {
        // claimData may be absent in stateless fallback responses — the initial
        // claimData seeded from the drip response is already in state.
        if (data.claimData) setClaimData(data.claimData);
        if (data.expiresInSeconds !== undefined) setExpiresIn(data.expiresInSeconds);
      }
    } catch {
      // Silently retry on network errors
    }
  }, [claimId, initialClaimData?.messageHashHex, l1TxHash]);

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

  // Report bridging progress to parent (drives walking character in footer)
  // Pending phase covers 0->0.15 (~20s L1 tx), bridge phase covers 0.15->0.95 (~150s)
  // Real timing: total 140-185s, bridge phase alone is 120-150s
  const onProgressRef = useRef(onProgressChange);
  onProgressRef.current = onProgressChange;
  useEffect(() => {
    if (status === "bridging") {
      const bridgeProgress = Math.min(elapsed / 150, 1);
      onProgressRef.current?.(0.15 + bridgeProgress * 0.80, false);
    } else if (status === "ready") {
      onProgressRef.current?.(1, true);
    }
  }, [status, elapsed]);

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

  const expiryCritical = expiresIn !== null && expiresIn < 60;

  // key={statusKey} forces remount → fires animate-panel-state-in on every transition
  const statusKey = error ? "error" : status;

  if (error || status === "expired") {
    const isError = !!error;
    return (
      <div key={statusKey} className="flex flex-col gap-5 animate-panel-state-in">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-7 w-7 items-center justify-center  border ${isError ? "border-red-500/30 bg-red-500/10" : "border-secondary/30 bg-secondary/10"}`}>
              <svg viewBox="0 0 14 14" fill="none" className={`h-3.5 w-3.5 ${isError ? "text-red-400" : "text-secondary"}`}>
                <path d="M7 2v5M7 10.5v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">
                {isError ? "Bridge Submitted" : "Claim Expired"}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant opacity-60">
                {isError
                  ? "The L1 bridge tx was sent. Status tracking failed. Use the data below to claim."
                  : "The L1→L2 message took too long. Please request Fee Juice again."}
              </p>
            </div>
          </div>

          {/* Show claim data even when polling fails — seeded from drip response */}
          {isError && claimData && (
            <div className="space-y-2">
              <div className="border border-outline-variant/40 bg-surface-low overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAllFields((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <span className="text-[10px] font-medium text-on-surface-variant opacity-60 transition-colors hover:text-on-surface">
                    Show all claim fields
                  </span>
                  <span className={`shrink-0 text-on-surface-variant opacity-50 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${showAllFields ? "rotate-45" : ""}`}>
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
                    <div className="border-t border-outline-variant/30 px-3 pb-3 pt-2 space-y-2">
                      <DataField label="Claim Amount" value={claimData.claimAmount} />
                      <DataField label="Message Leaf Index" value={claimData.messageLeafIndex} />
                      <DataField label="Claim Secret" value={claimData.claimSecretHex} />
                      <DataField label="Claim Secret Hash" value={claimData.claimSecretHashHex} />
                      <DataField label="Message Hash" value={claimData.messageHashHex} />
                    </div>
                  </div>
                </div>
              </div>
              {walletClaimedTx ? (
                <ClaimCompletePanel txHash={walletClaimedTx} />
              ) : (
                <>
                  <WalletClaimButton
                    claimData={{
                      claimAmount: claimData.claimAmount,
                      claimSecretHex: claimData.claimSecretHex,
                      messageLeafIndex: claimData.messageLeafIndex,
                    }}
                    recipient={recipient}
                    onClaimComplete={setWalletClaimedTx}
                    preConnectedWallet={connectedWallet}
                    preConnectedAddress={connectedAddress}
                  />
                  <div className="relative flex items-center py-1">
                    <div className="grow border-t border-outline-variant/30" />
                    <span className="mx-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-40">
                      Or use the CLI
                    </span>
                    <div className="grow border-t border-outline-variant/30" />
                  </div>
                  <ClaimCommands
                    claimAmount={claimData.claimAmount}
                    claimSecretHex={claimData.claimSecretHex}
                    messageLeafIndex={claimData.messageLeafIndex}
                  />
                </>
              )}
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
              <div className="absolute inset-0 animate-ping  bg-accent/20" />
              <div className="relative flex h-7 w-7 items-center justify-center  border border-accent/40 bg-accent/10">
                <div className="h-2 w-2 animate-pulse  bg-accent" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">Bridging Fee Juice to L2...</p>
              <p className="mt-0.5 text-xs text-on-surface-variant opacity-60">Initiating L1→L2 bridge deposit.</p>
            </div>
          </div>

          {/* Network row */}
          <div className="flex items-center gap-2 border border-outline-variant/30 bg-surface-low px-3 py-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping  bg-accent/60" style={{ animationDuration: "1.5s" }} />
              <span className="relative inline-flex h-1.5 w-1.5  bg-accent" />
            </span>
            <span className="text-xs text-on-surface-variant">Aztec L2 Testnet</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant opacity-50">
              <span>Broadcasting</span>
              <span className="font-mono">{formatElapsed(elapsed)}</span>
            </div>
            <div className="h-1.5 overflow-hidden " style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
              <div
                className="h-full  transition-all duration-1000"
                style={{
                  width: `${Math.min((elapsed / 120) * 100, 95)}%`,
                  background: "var(--accent)",
                  boxShadow: "0 0 8px var(--accent)",
                }}
              />
            </div>
          </div>

          <p className="text-xs text-on-surface-variant opacity-50">
            This usually takes 3-4 minutes. Please don&apos;t close this tab.
          </p>

          {l1TxHash && (
            <a
              href={`${SEPOLIA_ETHERSCAN}/${l1TxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between border border-outline-variant bg-surface-low px-4 py-2 font-label text-xs uppercase tracking-wider transition-all hover:border-accent hover:bg-accent/5"
            >
              <span className="text-on-surface-variant transition-colors group-hover:text-on-surface">
                View on Sepolia Etherscan
              </span>
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-on-surface-variant opacity-50 transition-all group-hover:translate-x-0.5 group-hover:text-accent">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      </div>
    );
  }

  // status === "ready"
  return (
    <div key={statusKey} className="flex flex-col gap-2 animate-panel-state-in">
      <div className="space-y-2">
        {/* Header row — flips to "Claimed" once the wallet flow completes
            so we don't keep telling the user the claim is still pending. */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center  border border-accent/30 bg-accent/10">
              <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-accent">
                <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-on-surface">
              {walletClaimedTx ? "Fee Juice Claimed" : "Fee Juice Ready"}
            </span>
          </div>
          <span className=" border border-accent/20 bg-accent/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-accent">
            {walletClaimedTx ? "Claimed" : "Ready to Claim"}
          </span>
        </div>

        {/* Network row. Hide expiry once claimed — it no longer applies
            because the bridge message has been nullified on chain. */}
        <div className="flex items-center gap-2 border border-outline-variant/30 bg-surface-low px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping  bg-secondary/60" style={{ animationDuration: "2.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5  bg-secondary" />
          </span>
          <span className="text-xs text-on-surface-variant">Aztec L2 Testnet</span>
          {!walletClaimedTx && expiresIn !== null && (
            <span className={`ml-auto font-mono text-xs ${expiryCritical ? "text-red-400 font-semibold" : "text-red-400"}`}>
              {expiresIn === 0 ? "Expired" : `Expires ${formatElapsed(expiresIn)}`}
            </span>
          )}
        </div>

        {/* Claim data accordion */}
        {claimData && (
          <div className="border border-outline-variant/40 bg-surface-low overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAllFields((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-[10px] font-medium text-on-surface-variant opacity-60 transition-colors hover:text-on-surface">
                Show all claim fields
              </span>
              <span className={`shrink-0 text-on-surface-variant opacity-50 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${showAllFields ? "rotate-45" : ""}`}>
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
                <div className="border-t border-outline-variant/30 px-3 pb-3 pt-2 space-y-2">
                  <DataField label="Claim Amount" value={claimData.claimAmount} />
                  <DataField label="Message Leaf Index" value={claimData.messageLeafIndex} />
                  <DataField label="Claim Secret" value={claimData.claimSecretHex} />
                  <DataField label="Claim Secret Hash" value={claimData.claimSecretHashHex} />
                  <DataField label="Message Hash" value={claimData.messageHashHex} />
                </div>
              </div>
            </div>
          </div>
        )}

        {claimData && walletClaimedTx ? (
          <ClaimCompletePanel txHash={walletClaimedTx} />
        ) : claimData ? (
          <>
            <WalletClaimButton
              claimData={{
                claimAmount: claimData.claimAmount,
                claimSecretHex: claimData.claimSecretHex,
                messageLeafIndex: claimData.messageLeafIndex,
              }}
              recipient={recipient}
              onClaimComplete={setWalletClaimedTx}
              preConnectedWallet={connectedWallet}
              preConnectedAddress={connectedAddress}
            />

            <div className="relative flex items-center py-1">
              <div className="grow border-t border-outline-variant/30" />
              <span className="mx-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-40">
                Or use the CLI
              </span>
              <div className="grow border-t border-outline-variant/30" />
            </div>

            <ClaimCommands
              claimAmount={claimData.claimAmount}
              claimSecretHex={claimData.claimSecretHex}
              messageLeafIndex={claimData.messageLeafIndex}
            />
          </>
        ) : null}
      </div>

      {l1TxHash && (
        <a
          href={`${SEPOLIA_ETHERSCAN}/${l1TxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between border border-outline-variant bg-surface-low px-4 py-2 font-label text-xs uppercase tracking-wider transition-all hover:border-accent hover:bg-accent/5"
        >
          <span className="text-on-surface-variant transition-colors group-hover:text-on-surface">
            View on Sepolia Etherscan
          </span>
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-on-surface-variant opacity-50 transition-all group-hover:translate-x-0.5 group-hover:text-accent">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}

      {/* Reset button pinned to bottom */}
      <ResetButton onReset={onReset} />
    </div>
  );
}
