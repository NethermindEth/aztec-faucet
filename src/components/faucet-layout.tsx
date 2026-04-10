"use client";

import { useState } from "react";
import React from "react";
import { FaucetForm } from "./faucet-form";

import { DripResult, type DripResultData } from "./drip-result";
import { ClaimTracker } from "./claim-tracker";
import { ConfettiBurst } from "./confetti-burst";

type InitialClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
  l1TxHash?: string;
};

type RightPanel =
  | { kind: "pending"; asset: string }
  | { kind: "result"; data: DripResultData }
  | { kind: "claim"; claimId: string; initialClaimData?: InitialClaimData }
  | null;

const PENDING_LABELS: Record<string, string> = {
  eth: "Sending ETH to Sepolia...",
  "fee-juice": "Bridging Fee Juice to L2...",
};

const PENDING_SUBS: Record<string, string> = {
  eth: "Broadcasting transaction on Sepolia testnet.",
  "fee-juice": "Initiating L1→L2 bridge deposit.",
};

function PendingPanel({ asset }: { asset: string }) {
  return (
    <div className="flex h-full flex-col justify-between gap-5">
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
            <p className="text-sm font-semibold text-white">
              {PENDING_LABELS[asset] ?? "Processing..."}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {PENDING_SUBS[asset] ?? "Please wait."}
            </p>
          </div>
        </div>

        {/* Network row */}
        <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/2 px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chartreuse/60" style={{ animationDuration: "1.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-chartreuse" />
          </span>
          <span className="text-xs text-zinc-400">
            {asset === "eth" ? "Sepolia Testnet" : "Aztec L2 Testnet"}
          </span>
          {asset === "eth" && (
            <span className="ml-auto font-mono text-xs text-zinc-600">11155111</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span>Broadcasting</span>
            <span>Confirming</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
            <div className="h-full w-2/3 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} />
          </div>
        </div>

        <p className="text-xs text-zinc-600">
          This usually takes a few seconds. Please don&apos;t close this tab.
        </p>
      </div>
    </div>
  );
}

export function FaucetLayout({ footer, onGoToAccount }: { footer?: React.ReactNode; onGoToAccount?: () => void }) {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const handlePending = (asset: string) => {
    setRightPanel({ kind: "pending", asset });
  };

  const handleSuccess = (data: DripResultData) => {
    setRightPanel({ kind: "result", data });
  };

  const handleClaim = (claimId: string, initialClaimData?: InitialClaimData) => {
    setRightPanel({ kind: "claim", claimId, initialClaimData });
  };

  const handleError = () => {
    setRightPanel(null);
  };

  const handleReset = () => {
    setRightPanel(null);
  };

  const isSplit = rightPanel !== null;

  return (
    <div
      className={`mx-auto w-full transition-[max-width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isSplit ? "max-w-[58rem]" : "max-w-[32rem]"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start gap-5">
        {/* Left panel — always visible */}
        <div
          className={`glass-card rounded-2xl p-6 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSplit ? "w-full sm:w-md sm:shrink-0" : "w-full"
          }`}
        >
          <FaucetForm
            onSuccess={handleSuccess}
            onClaim={handleClaim}
            onPending={handlePending}
            onError={handleError}
            locked={isSplit}
            onGoToAccount={onGoToAccount}
          />
        </div>

        {/* Right panel — slides in */}
        {isSplit && (
          <div className={`w-full sm:w-md sm:shrink-0 min-h-0 animate-slide-in-right ${rightPanel.kind === "pending" ? "self-stretch" : "self-start"}`}>
            <div className={`glass-card rounded-2xl p-6 ${rightPanel.kind === "pending" ? "flex flex-col h-full overflow-x-hidden" : ""}`}>
              <div key={rightPanel.kind} className="flex flex-col animate-panel-state-in">
                {rightPanel.kind === "pending" ? (
                  <PendingPanel asset={rightPanel.asset} />
                ) : rightPanel.kind === "result" ? (
                  <DripResult
                    result={rightPanel.data}
                    error={null}
                    retryAfter={null}
                    onReset={handleReset}
                  />
                ) : (
                  <>
                    <ConfettiBurst />
                    <ClaimTracker
                      claimId={rightPanel.claimId}
                      initialClaimData={rightPanel.initialClaimData}
                      l1TxHash={rightPanel.initialClaimData?.l1TxHash}
                      onReset={handleReset}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer — hidden when split to keep page height in check */}
      {!isSplit && footer}
    </div>
  );
}
