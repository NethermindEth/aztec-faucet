"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import type { Wallet } from "@aztec/aztec.js/wallet";
import dynamic from "next/dynamic";
import { FaucetForm } from "./faucet-form";

import { DripResult, type DripResultData } from "./drip-result";
import { ClaimTracker } from "./claim-tracker";
import { ConfettiBurst } from "./confetti-burst";
import { L1_CHAIN_ID } from "@/lib/network-config";
import { useDeferredEffect } from "@/lib/use-deferred-effect";

const WalletConnectBar = dynamic(
  () => import("./wallet-connect-bar").then((m) => m.WalletConnectBar),
  {
    ssr: false,
    loading: () => <div className="h-9 min-w-52 border border-outline-variant bg-surface-high" />,
  },
);

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
  | { kind: "result"; data: DripResultData; recipient: string }
  | { kind: "claim"; claimId: string; initialClaimData?: InitialClaimData; recipient: string }
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
            <span className="ml-auto font-label text-xs text-on-surface-variant opacity-40">{L1_CHAIN_ID}</span>
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

export function FaucetLayout({ footer, onSplitChange, onBridgingProgress }: { footer?: React.ReactNode; onSplitChange?: (isSplit: boolean) => void; onBridgingProgress?: (progress: number, isReady: boolean) => void }) {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [activeAsset, setActiveAsset] = useState<string>("fee-juice");
  // walletAddress = wallet bar's intent; formAddress = what's in the input.
  // Bar diffs these to flip between "Connected" and "Connect".
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<Wallet | null>(null);
  const [formAddress, setFormAddress] = useState<string>("");

  const pushClaimUrl = useCallback((claimId: string, recipient: string, asset: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("claim", claimId);
    url.searchParams.set("r", recipient);
    url.searchParams.set("asset", asset);
    history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
  }, []);

  const clearClaimUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("claim")) return;
    url.searchParams.delete("claim");
    url.searchParams.delete("r");
    url.searchParams.delete("asset");
    const qs = url.searchParams.toString();
    history.replaceState(null, "", url.pathname + (qs ? "?" + qs : ""));
  }, []);

  // Restores the claim panel from the URL after hydration.
  useDeferredEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimId = params.get("claim");
    const recipient = params.get("r");
    const asset = params.get("asset");
    if (!claimId || !recipient) return;
    setRightPanel({ kind: "claim", claimId, recipient, initialClaimData: undefined });
    if (asset) setActiveAsset(asset);
  }, []);

  const handlePending = (asset: string) => {
    setRightPanel({ kind: "pending", asset });
    clearClaimUrl();
  };

  const handleSuccess = (data: DripResultData, recipient: string) => {
    setRightPanel({ kind: "result", data, recipient });
    clearClaimUrl();
  };

  const handleClaim = (claimId: string, initialClaimData: InitialClaimData | undefined, recipient: string) => {
    setRightPanel({ kind: "claim", claimId, initialClaimData, recipient });
    pushClaimUrl(claimId, recipient, activeAsset);
  };

  const handleError = () => {
    setRightPanel(null);
    clearClaimUrl();
    onBridgingProgress?.(0, false);
  };

  const handleReset = () => {
    setRightPanel(null);
    clearClaimUrl();
    onBridgingProgress?.(0, false);
  };

  const isSplit = rightPanel !== null;
  const pendingStart = useRef<number>(0);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSplit) rightPanelRef.current?.focus();
  }, [isSplit]);

  useEffect(() => {
    onSplitChange?.(isSplit);
  }, [isSplit, onSplitChange]);

  // Pending phase progress: 0 → 0.15 over ~20s before claim-tracker takes over.
  const isPendingFeeJuice = rightPanel?.kind === "pending" && rightPanel.asset === "fee-juice";
  useEffect(() => {
    if (!isPendingFeeJuice) return;
    pendingStart.current = Date.now();
    onBridgingProgress?.(0.01, false);
    const interval = setInterval(() => {
      const elapsed = (Date.now() - pendingStart.current) / 1000;
      const progress = Math.min(elapsed / 20, 0.15);
      onBridgingProgress?.(progress, false);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPendingFeeJuice]); // eslint-disable-line react-hooks/exhaustive-deps

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
              onAssetChange={setActiveAsset}
              prefilledAddress={walletAddress}
              onAddressChange={setFormAddress}
              headerRight={
                <WalletConnectBar
                  asset={activeAsset}
                  currentFormAddress={formAddress}
                  onAddress={setWalletAddress}
                  onWalletConnect={setConnectedWallet}
                />
              }
            />
          </div>
        </div>

        {/* Right panel — slides in */}
        {isSplit && (
          <div
            ref={rightPanelRef}
            tabIndex={-1}
            className={`w-full xl:w-1/2 xl:shrink-0 min-h-0 animate-slide-in-right outline-none ${rightPanel.kind === "pending" ? "self-stretch" : "self-start"}`}
          >
            <div className={`bg-surface-container border border-outline-variant/40 p-4 sm:p-5 md:p-7 shadow-2xl ${rightPanel.kind === "pending" ? "flex flex-col h-full overflow-x-hidden" : ""}`}>
              <div key={rightPanel.kind} className="flex flex-col animate-panel-state-in">
                {rightPanel.kind === "pending" ? (
                  <PendingPanel asset={rightPanel.asset} />
                ) : rightPanel.kind === "result" ? (
                  <DripResult
                    result={rightPanel.data}
                    error={null}
                    retryAfter={null}
                    recipient={rightPanel.recipient}
                    onReset={handleReset}
                    connectedWallet={connectedWallet ?? undefined}
                    connectedAddress={walletAddress ?? undefined}
                  />
                ) : (
                  <>
                    <ConfettiBurst />
                    <ClaimTracker
                      claimId={rightPanel.claimId}
                      initialClaimData={rightPanel.initialClaimData}
                      l1TxHash={rightPanel.initialClaimData?.l1TxHash}
                      recipient={rightPanel.recipient}
                      onReset={handleReset}
                      onProgressChange={onBridgingProgress}
                      connectedWallet={connectedWallet ?? undefined}
                      connectedAddress={walletAddress ?? undefined}
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
