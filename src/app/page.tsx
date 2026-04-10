"use client";

import { useState } from "react";
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
      {/* Marquee Ticker Banner */}
      <header className="w-full py-1 overflow-hidden whitespace-nowrap bg-[#ffd7f5] text-[#161312] font-label text-[10px] font-bold tracking-widest z-50 shrink-0">
        <div className="inline-flex w-max animate-marquee">
          {[...Array(2)].map((_, i) => (
            <span key={i} className="flex gap-8">
              <span>CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
              <span>CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
              <span>CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
              <span>CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
              <span>CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
              <span className="mr-8">CLAIM YOUR TESTNET TOKENS &bull; GET FEE JUICE NOW</span>
            </span>
          ))}
        </div>
      </header>

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
      <main className="flex-1 relative flex flex-col items-center justify-start px-4 md:px-10 py-4 md:py-6 z-10 overflow-y-auto min-h-0">
        {/* Renaissance overlay — only on faucet view */}
        {view === "faucet" && <div className="renaissance-overlay" />}

        {/* Faucet view — hero editorial layout */}
        <div className={
          leaving === "faucet" ? "animate-panel-state-out w-full h-full" :
          view === "faucet" ? "animate-panel-state-in w-full h-full" :
          "hidden"
        }>
          <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-center h-full">
            {/* Left: Editorial branding — hidden when result panel is showing */}
            <div className={`${faucetSplit ? "hidden" : "flex"} lg:col-span-5 flex-col gap-3 justify-center`}>
              <div className="flex items-center gap-3">
                <span className="w-8 h-px bg-accent" />
                <span className="font-label text-[10px] tracking-[0.3em] uppercase text-accent">
                  Testnet Faucet
                </span>
              </div>
              <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl leading-[0.9] italic tracking-tighter text-on-surface">
                The Next <br /> Renaissance.
              </h1>
              <p className="font-body text-sm md:text-base text-on-surface-variant max-w-sm leading-relaxed opacity-80">
                Get testnet tokens for the first decentralized, privacy-preserving L2 on Ethereum. Fee Juice and ETH, one click away.
              </p>
              <div className="p-4 bg-surface-high border-l-4 border-accent max-w-xs">
                <span className="font-label text-[9px] text-accent uppercase block mb-1">Aztec Network</span>
                <p className="text-xs font-body italic text-on-surface-variant">
                  &ldquo;Don&apos;t take our word for it. Trust the code.&rdquo;
                </p>
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-2 mt-1">
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

              {/* Fee Juice helper accordions */}
              <FeeJuiceHelpers onGoToAccount={() => switchTab("keys")} />
            </div>

            {/* Right: Faucet form card */}
            <div className={faucetSplit ? "lg:col-span-12" : "lg:col-span-7"}>
              <FaucetLayout
                onGoToAccount={() => switchTab("keys")}
                onSplitChange={setFaucetSplit}
                footer={
                  <div className="mt-3">
                    <p className="font-label text-[10px] text-center text-on-surface-variant uppercase tracking-widest opacity-40">
                      One request per token per 24 hours
                    </p>
                  </div>
                }
              />
            </div>
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
            className={`w-full mx-auto ${
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
      <footer className="w-full px-4 md:px-10 py-3 md:py-6 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-3 border-t border-outline-variant bg-surface-lowest font-label text-[9px] text-outline-variant uppercase z-20 shrink-0">
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
