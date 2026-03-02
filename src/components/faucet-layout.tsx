"use client";

import { useState } from "react";
import { FaucetForm } from "./faucet-form";
import { DripResult, type DripResultData } from "./drip-result";
import { ClaimTracker } from "./claim-tracker";

type RightPanel =
  | { kind: "pending"; asset: string }
  | { kind: "result"; data: DripResultData }
  | { kind: "claim"; claimId: string }
  | null;

const PENDING_LABELS: Record<string, string> = {
  eth: "Sending ETH to Sepolia...",
  "fee-juice": "Bridging Fee Juice to L2...",
  "test-token": "Minting tokens on L2...",
};

const PENDING_SUBS: Record<string, string> = {
  eth: "Broadcasting transaction on Sepolia testnet.",
  "fee-juice": "Initiating L1→L2 bridge deposit.",
  "test-token": "Minting to your public Aztec balance.",
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
            {asset === "eth" ? "Sepolia Testnet" : "Aztec L2 Devnet"}
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
          <div className="h-1 overflow-hidden rounded-full bg-white/6">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-chartreuse/40" />
          </div>
        </div>

        <p className="text-xs text-zinc-600">
          This usually takes a few seconds. Please don&apos;t close this tab.
        </p>
      </div>
    </div>
  );
}

export function FaucetLayout() {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const handlePending = (asset: string) => {
    setRightPanel({ kind: "pending", asset });
  };

  const handleSuccess = (data: DripResultData) => {
    setRightPanel({ kind: "result", data });
  };

  const handleClaim = (claimId: string) => {
    setRightPanel({ kind: "claim", claimId });
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
      <div className="flex items-stretch gap-5">
        {/* Left panel — always visible */}
        <div
          className={`glass-card rounded-2xl p-6 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSplit ? "w-[28rem] shrink-0" : "w-full"
          }`}
        >
          <FaucetForm
            onSuccess={handleSuccess}
            onClaim={handleClaim}
            onPending={handlePending}
            onError={handleError}
            locked={isSplit}
          />
        </div>

        {/* Right panel — same size as left, slides in */}
        {isSplit && (
          <div className="w-[28rem] shrink-0 animate-slide-in-right">
            <div className="glass-card flex h-full flex-col rounded-2xl p-6">
              <div key={rightPanel.kind} className="flex h-full flex-col animate-panel-state-in">
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
                  <ClaimTracker
                    claimId={rightPanel.claimId}
                    onReset={handleReset}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
