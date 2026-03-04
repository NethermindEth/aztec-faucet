"use client";

import { useState } from "react";
import { FaucetLayout } from "@/components/faucet-layout";
import { NetworkStatus } from "@/components/network-status";
import { StatusView } from "@/components/status-view";
import { BalanceView } from "@/components/balance-view";
import { FaqView } from "@/components/faq-view";
import { NetworkView } from "@/components/network-view";

type View = "faucet" | "balance" | "faq" | "status" | "network";

const DiamondIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" className="h-9 w-9 text-chartreuse">
    <path
      d="M16 2L28 16L16 30L4 16L16 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="currentColor"
      fillOpacity="0.08"
    />
    <path
      d="M16 8L22 16L16 24L10 16L16 8Z"
      stroke="currentColor"
      strokeWidth="1"
      fill="currentColor"
      fillOpacity="0.15"
    />
  </svg>
);

export default function Home() {
  const [view, setView] = useState<View>("faucet");
  const [howOpen, setHowOpen] = useState(false);

  return (
    <main className="bg-atmosphere flex min-h-screen flex-col items-center px-4 pt-10 pb-12">
      <div className="relative z-10 w-full">

        {/* Header — static, never re-renders */}
        <div className="mx-auto mb-6 max-w-lg text-center animate-fade-up">
          <div className="mb-3 flex justify-center">
            <DiamondIcon />
          </div>
          <h1 className="font-display text-5xl text-white">
            Aztec <span className="text-chartreuse">Faucet</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            Fee Juice for building on the Aztec devnet
          </p>
        </div>

        {/* Tab bar — only shown for faucet / balance / faq / network views */}
        {view !== "status" && (
          <div className="mx-auto mb-4 max-w-lg">
            <div className="flex items-center gap-1 rounded-full border border-white/6 bg-white/2 p-1">
              <button
                type="button"
                onClick={() => setView("faucet")}
                className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
                  view === "faucet"
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Faucet
              </button>
              <button
                type="button"
                onClick={() => setView("balance")}
                className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
                  view === "balance"
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Balance
              </button>
              <button
                type="button"
                onClick={() => setView("network")}
                className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
                  view === "network"
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Network
              </button>
              <button
                type="button"
                onClick={() => setView("faq")}
                className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
                  view === "faq"
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                FAQ
              </button>
            </div>
          </div>
        )}

        {/* View body — keyed so transition fires on every switch */}
        <div key={view} className="animate-panel-state-in">
          {view === "balance" ? (
            <BalanceView />
          ) : view === "faq" ? (
            <FaqView />
          ) : view === "network" ? (
            <NetworkView />
          ) : view === "faucet" ? (
            <>
              {/* Network status bar */}
              <div className="mx-auto max-w-lg">
                <NetworkStatus />
              </div>

              {/* Split-panel faucet form + footer (footer hidden when split) */}
              <div className="mt-2">
                <FaucetLayout
                  footer={
                    <div className="mx-auto mt-5 max-w-lg space-y-3">
                      <div className="glass-card rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setHowOpen(!howOpen)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left"
                        >
                          <span className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">How does this work?</span>
                          <span className={`text-chartreuse transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${howOpen ? "rotate-45" : ""}`}>
                            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </span>
                        </button>
                        <div
                          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                          style={{ gridTemplateRows: howOpen ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden">
                            <div className="space-y-2 border-t border-white/6 px-4 py-3 text-xs text-zinc-500">
                              <p>
                                <strong className="text-zinc-300">ETH:</strong> Sent directly to your Ethereum address on Sepolia. Use it to pay L1 gas fees.
                              </p>
                              <p>
                                <strong className="text-zinc-300">Fee Juice:</strong> Aztec&apos;s native fee token. Required for every transaction on Aztec. The faucet sends a message through the Fee Juice Portal on L1, which sits pending until the next rollup block is processed (roughly 1-2 minutes). You&apos;ll receive a secret claim preimage to consume the message and receive your Fee Juice on L2.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center text-xs text-zinc-600">
                        <p>Rate limited to one request per token per 24 hours.</p>
                        <p className="mt-1">
                          <a
                            href="https://docs.aztec.network"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-chartreuse/60 transition-colors hover:text-chartreuse"
                          >
                            Aztec Documentation
                          </a>
                          {" · "}
                          <a
                            href="https://docs.aztec.network/guides/getting_started"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-chartreuse/60 transition-colors hover:text-chartreuse"
                          >
                            Getting Started
                          </a>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => setView("status")}
                            className="text-chartreuse/60 transition-colors hover:text-chartreuse"
                          >
                            API Status
                          </button>
                        </p>
                      </div>
                    </div>
                  }
                />
              </div>
            </>
          ) : (
            <StatusView onBack={() => setView("faucet")} />
          )}
        </div>

      </div>
    </main>
  );
}
