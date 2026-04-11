"use client";

import { useState, useEffect } from "react";
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
  "fee-juice": "Initiating L1 to L2 bridge deposit.",
};

function PendingPanel({ asset }: { asset: string }) {
  return (
    <div className="flex h-full flex-col justify-between gap-5">
      <div className="space-y-5">
        {/* Animated indicator */}
        <div className="flex items-center gap-3.5">
          <div className="relative h-7 w-7 shrink-0">
            <div className="absolute inset-0 animate-ping bg-accent/20" />
            <div className="relative flex h-7 w-7 items-center justify-center border border-accent/40 bg-accent/10">
              <div className="h-2 w-2 animate-pulse bg-accent" />
            </div>
          </div>
          <div>
            <p className="font-label text-sm font-bold uppercase tracking-wider text-on-surface">
              {PENDING_LABELS[asset] ?? "Processing..."}
            </p>
            <p className="mt-0.5 font-label text-xs text-on-surface-variant opacity-60">
              {PENDING_SUBS[asset] ?? "Please wait."}
            </p>
          </div>
        </div>

        {/* Network row */}
        <div className="flex items-center gap-2 border border-outline-variant/30 bg-surface-low px-4 py-3">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping bg-accent/60" style={{ animationDuration: "1.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
          </span>
          <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant">
            {asset === "eth" ? "Sepolia Testnet" : "Aztec L2 Testnet"}
          </span>
          {asset === "eth" && (
            <span className="ml-auto font-label text-xs text-on-surface-variant opacity-40">11155111</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between font-label text-[10px] text-on-surface-variant uppercase tracking-widest opacity-50">
            <span>Broadcasting</span>
            <span>Confirming</span>
          </div>
          <div className="h-1 overflow-hidden bg-surface-highest">
            <div className="h-full w-2/3 bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} />
          </div>
        </div>

        <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest opacity-40">
          This usually takes a few seconds. Please don&apos;t close this tab.
        </p>
      </div>
    </div>
  );
}

export function FaucetLayout({ footer, onGoToAccount, onSplitChange }: { footer?: React.ReactNode; onGoToAccount?: () => void; onSplitChange?: (isSplit: boolean) => void }) {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [activeAsset, setActiveAsset] = useState<string>("fee-juice");

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

  useEffect(() => {
    onSplitChange?.(isSplit);
  }, [isSplit, onSplitChange]);

  return (
    <div className="w-full" data-asset={activeAsset}>
      <div className={`flex flex-col ${isSplit ? "xl:flex-row" : ""} items-start gap-5`}>
        {/* Left panel — Faucet form */}
        <div
          className={`bg-surface-container border border-outline-variant/40 shadow-2xl p-4 sm:p-5 md:p-7 relative overflow-hidden custom-glow transition-all duration-500 ${
            isSplit ? "w-full xl:w-1/2 xl:shrink-0" : "w-full"
          }`}
        >
          {/* Background glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent opacity-5 rounded-full blur-[100px]" />
          <div className="relative z-10">
            <FaucetForm
              onSuccess={handleSuccess}
              onClaim={handleClaim}
              onPending={handlePending}
              onError={handleError}
              locked={isSplit}
              onGoToAccount={onGoToAccount}
              onAssetChange={setActiveAsset}
            />
          </div>
        </div>

        {/* Right panel — slides in */}
        {isSplit && (
          <div className={`w-full xl:w-1/2 xl:shrink-0 min-h-0 animate-slide-in-right ${rightPanel.kind === "pending" ? "self-stretch" : "self-start"}`}>
            <div className={`bg-surface-container border border-outline-variant/40 p-4 sm:p-5 md:p-7 shadow-2xl ${rightPanel.kind === "pending" ? "flex flex-col h-full overflow-x-hidden" : ""}`}>
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

      {/* Footer — hidden when split */}
      {!isSplit && footer}
    </div>
  );
}
