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
      <div className="flex items-center gap-2 font-label text-xs uppercase tracking-wider">
        <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
        <span className="text-red-400">Unavailable</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 font-label text-xs uppercase tracking-wider">
        <div className="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-pulse" />
        <span className="text-on-surface-variant opacity-50">Connecting...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start md:items-end">
      {/* SDK outdated warning */}
      {status.sdk?.outdated && (
        <div className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-yellow-400">
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          SDK outdated ({status.sdk.faucetVersion})
        </div>
      )}

      {/* Network status */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-label text-xs uppercase tracking-wider">
        <span className="text-on-surface-variant opacity-50">Chain {status.network.l1ChainId}</span>
        <span className="text-outline-variant">|</span>
        <span className="text-on-surface-variant">
          {Number(status.l1BalanceEth).toFixed(4)} <span className="text-accent">ETH</span>
        </span>
        {status.l1FeeJuiceBalance !== null && status.l1FeeJuiceBalance !== undefined && Number(status.l1FeeJuiceBalance) > 0 && (
          <>
            <span className="text-outline-variant">|</span>
            <span className="text-on-surface-variant" title="L1 Fee Juice ERC20 balance held by the faucet wallet">
              {Number(status.l1FeeJuiceBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-accent">FJ</span>
            </span>
          </>
        )}
        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
      </div>
    </div>
  );
}
