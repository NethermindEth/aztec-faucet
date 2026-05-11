"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { FaucetLayout } from "@/components/faucet-layout";
import { FeeJuiceHelpers } from "@/components/faucet-form";
import { NetworkStatus } from "@/components/network-status";
import { StatusView } from "@/components/status-view";
import { BalanceView } from "@/components/balance-view";
import { FaqView } from "@/components/faq-view";
import { NetworkView } from "@/components/network-view";
import { KeygenView } from "@/components/keygen-view";
import { DonateView } from "@/components/donate-view";
import { WalkingCharacter } from "@/components/walking-character";

type View = "faucet" | "balance" | "faq" | "status" | "network" | "keys" | "donate";

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: "faucet", label: "Faucet" },
  { view: "keys", label: "Account" },
  { view: "balance", label: "Balance" },
  { view: "network", label: "Network" },
  { view: "faq", label: "FAQ" },
  { view: "donate", label: "Donate" },
];

export default function Home() {
  const [view, setView] = useState<View>("faucet");
  const [leaving, setLeaving] = useState<View | null>(null);
  const [faucetSplit, setFaucetSplit] = useState(false);
  const [bridging, setBridging] = useState<{ progress: number; isReady: boolean } | null>(null);
  const bridgingRef = useRef(bridging);
  const handleBridgingProgress = useCallback((p: number, r: boolean) => {
    const prev = bridgingRef.current;
    if (p <= 0) {
      if (prev !== null) { bridgingRef.current = null; setBridging(null); }
      return;
    }
    if (prev && prev.progress === p && prev.isReady === r) return;
    const next = { progress: p, isReady: r };
    bridgingRef.current = next;
    setBridging(next);
  }, []);

  function switchTab(target: View) {
    if (target === view || leaving !== null) return;
    setLeaving(view);
    setTimeout(() => {
      setView(target);
      setLeaving(null);
    }, 170);
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Navigation Bar */}
      <nav className="relative flex justify-between items-center w-full px-6 md:px-10 h-14 max-w-[1920px] mx-auto bg-surface z-40 shrink-0 border-b border-outline-variant/30">
        <div className="flex items-center gap-2">
          <Image
            src="/aztec-symbol.svg"
            alt="Aztec"
            width={22}
            height={22}
          />
          <span className="text-xl font-bold italic tracking-tighter text-accent font-headline">
            Aztec Faucet
          </span>
        </div>

        {/* Desktop nav links — absolutely centered */}
        <div className="hidden md:flex gap-6 items-center font-headline text-sm tracking-tight uppercase absolute left-1/2 -translate-x-1/2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => switchTab(item.view)}
              className={`transition-colors duration-300 pb-0.5 ${
                view === item.view
                  ? "text-accent border-b-2 border-accent"
                  : "text-on-surface opacity-70 hover:text-accent hover:opacity-100 border-b-2 border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Network status */}
        <div className="hidden md:block">
          <NetworkStatus />
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden text-on-surface"
          onClick={() => {
            const menu = document.getElementById("mobile-nav");
            menu?.classList.toggle("hidden");
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      {/* Mobile nav dropdown */}
      <div id="mobile-nav" className="hidden md:hidden bg-surface-container border-b border-outline-variant z-30 relative shrink-0">
        <div className="px-4 py-3 flex flex-col gap-1">
          <div className="grid grid-cols-3 gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => {
                  switchTab(item.view);
                  document.getElementById("mobile-nav")?.classList.add("hidden");
                }}
                className={`text-center font-headline text-sm uppercase tracking-tight py-2.5 transition-colors ${
                  view === item.view
                    ? "text-accent bg-surface-high"
                    : "text-on-surface opacity-70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-outline-variant">
            <NetworkStatus />
          </div>
        </div>
      </div>

      {/* Main Content — fills remaining viewport */}
      <main className="flex-1 relative flex flex-col items-center justify-start px-4 md:px-10 py-4 md:py-6 pb-8 md:pb-10 z-10 overflow-y-auto min-h-0">
        {/* Renaissance overlay — only on faucet view */}
        {view === "faucet" && <div className="renaissance-overlay" />}

        {/* Faucet view — hero editorial layout */}
        <div className={
          leaving === "faucet" ? "animate-panel-state-out w-full h-full" :
          view === "faucet" ? "animate-panel-state-in w-full h-full" :
          "hidden"
        }>
          <div className="w-full max-w-7xl mx-auto flex flex-col items-center gap-4 h-full pt-8 md:pt-12">
            {/* Faucet form */}
            <div className={faucetSplit ? "w-full" : "w-full max-w-2xl"}>
              <FaucetLayout
                onSplitChange={setFaucetSplit}
                onBridgingProgress={handleBridgingProgress}
                footer={
                  <div className="mt-3">
                    <p className="font-label text-[10px] text-center text-on-surface-variant uppercase tracking-widest opacity-40">
                      One request per token per 8 hours
                    </p>
                  </div>
                }
              />
            </div>

            {/* Links + FAQ accordions — hidden during split (bridging/claim) */}
            {!faucetSplit && (
              <div className="w-full max-w-2xl flex flex-col gap-3 mt-10">
                <div className="flex flex-wrap gap-2 justify-center">
                  <a
                    href="https://docs.aztec.network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost px-4 py-2 text-[10px]"
                  >
                    Documentation
                  </a>
                  <a
                    href="https://docs.aztec.network/guides/getting_started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost px-4 py-2 text-[10px]"
                  >
                    Getting Started
                  </a>
                  <button
                    type="button"
                    onClick={() => switchTab("status")}
                    className="btn-ghost px-4 py-2 text-[10px]"
                  >
                    API Status
                  </button>
                </div>
                <FeeJuiceHelpers onGoToAccount={() => switchTab("keys")} />
              </div>
            )}
          </div>
        </div>

        {/* Keys view — always mounted for state persistence */}
        <div className={
          leaving === "keys" ? "animate-panel-state-out w-full max-w-xl mx-auto shrink-0" :
          view === "keys" ? "animate-panel-state-in w-full max-w-xl mx-auto shrink-0" :
          "hidden"
        }>
          <KeygenView />
        </div>

        {/* All other views */}
        {(view !== "faucet" && view !== "keys") || (leaving !== null && leaving !== "faucet" && leaving !== "keys") ? (
          <div
            key={leaving ?? view}
            className={`w-full mx-auto shrink-0 ${
              (leaving ?? view) === "network" || (leaving ?? view) === "faq" ? "" : "max-w-xl"
            } ${
              leaving !== null && leaving !== "faucet" && leaving !== "keys"
                ? "animate-panel-state-out"
                : "animate-panel-state-in"
            }`}
          >
            {(leaving ?? view) === "balance" ? (
              <BalanceView />
            ) : (leaving ?? view) === "faq" ? (
              <FaqView />
            ) : (leaving ?? view) === "network" ? (
              <NetworkView />
            ) : (leaving ?? view) === "donate" ? (
              <DonateView />
            ) : (
              <StatusView onBack={() => switchTab("faucet")} />
            )}
          </div>
        ) : null}
      </main>

      {/* Footer — compact, always visible */}
      <footer className="relative w-full px-4 md:px-10 py-3 md:py-6 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-3 border-t border-outline-variant bg-surface-lowest font-label text-[9px] text-outline-variant uppercase z-20 shrink-0">
        {bridging && <div className="hidden md:block"><WalkingCharacter progress={bridging.progress} isReady={bridging.isReady} /></div>}
        <div className="flex items-center gap-3">
          <Image
            src="/powered-by-nethermind-dark.svg"
            alt="Powered by Nethermind"
            width={110}
            height={16}
          />
        </div>
        <div className="flex gap-6 md:gap-8">
          <a href="https://docs.aztec.network" target="_blank" rel="noopener noreferrer" className="text-outline hover:text-secondary transition-all">Docs</a>
          <a href="https://github.com/NethermindEth/aztec-faucet" target="_blank" rel="noopener noreferrer" className="text-outline hover:text-secondary transition-all">GitHub</a>
          <span className="text-outline">MIT License</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-accent">System Status: Active</span>
          <div className="w-1.5 h-1.5 bg-accent rounded-full" />
        </div>
      </footer>
    </div>
  );
}
