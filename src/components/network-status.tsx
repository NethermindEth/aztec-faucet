"use client";

import { useEffect, useState } from "react";
type StatusData = {
  healthy: boolean;
  faucetAddress: string;
  l1BalanceEth: string;
  l1FeeJuiceBalance: string | null;
  assets: { name: string; available: boolean }[];
  network: {
    l1ChainId: number;
    aztecNodeUrl: string;
  };
  sdk?: {
    faucetVersion: string;
    latestVersion: string | null;
    outdated: boolean;
  };
};

export function NetworkStatus() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function fetchStatus() {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      fetch("/api/status", { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Status API returned ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setStatus(data);
          setError(false);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            const elapsed = Date.now() - startedAt;
            if (elapsed < 9_000) return;
            console.error("Status fetch timed out");
          } else {
            console.error("Status fetch failed:", err);
          }
          setError(true);
        })
        .finally(() => clearTimeout(timeout));
    }

    setStatus(null);
    setError(false);
    fetchStatus();
    pollTimer = setInterval(fetchStatus, 60_000);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center rounded-full border border-white/10 bg-zinc-900/80 p-1.5 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-red-400">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Unavailable
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center rounded-full border border-white/10 bg-zinc-900/80 p-1.5 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-zinc-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-600" />
          Connecting...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      {/* SDK outdated warning */}
      {status.sdk?.outdated && (
        <div className="flex items-center rounded-full border border-yellow-500/20 bg-zinc-900/80 p-1.5 shadow-lg shadow-black/40 backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-yellow-400">
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
              <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            SDK outdated ({status.sdk.faucetVersion})
          </div>
        </div>
      )}

      {/* Network status pill — outer shell matches devnet/testnet toggle */}
      <div
        className="flex items-center rounded-full border bg-zinc-900/80 p-1.5 shadow-lg shadow-black/40 backdrop-blur-md"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 28%, transparent)" }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-zinc-400"
          style={{
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            boxShadow: "0 1px 2px color-mix(in srgb, var(--accent) 20%, transparent)",
          }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          {/* Chain ID — hidden on mobile to avoid colliding with the right-side toggle */}
          <span className="hidden sm:inline">Chain {status.network.l1ChainId}</span>
          <span className="hidden sm:inline text-zinc-600">·</span>
          <span className="font-normal">{Number(status.l1BalanceEth).toFixed(4)} <span style={{ color: "var(--accent)" }}>ETH</span></span>
          {status.l1FeeJuiceBalance !== null && status.l1FeeJuiceBalance !== undefined && Number(status.l1FeeJuiceBalance) > 0 && (
            <>
              <span className="hidden sm:inline text-zinc-600">·</span>
              <span className="hidden sm:inline font-normal" title="L1 Fee Juice ERC20 balance held by the faucet wallet">
                {Number(status.l1FeeJuiceBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span style={{ color: "var(--accent)" }}>FJ</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
