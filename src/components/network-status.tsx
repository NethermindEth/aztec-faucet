"use client";

import { useEffect, useState } from "react";
import type { Network } from "@/lib/network-config";

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

export function NetworkStatus({ network }: { network: Network }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setStatus(null);
    setError(false);
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    fetch(`/api/status?network=${network}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Status API returned ${res.status}`);
        return res.json();
      })
      .then(setStatus)
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

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [network]);

  if (error) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/4 px-3 py-2 text-xs text-red-400">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        Faucet unavailable. Check server configuration.
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/6 px-3 py-2 text-xs text-zinc-600">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-600" />
        Connecting...
      </div>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {/* SDK outdated warning */}
      {status.sdk?.outdated && (
        <div className="flex items-start gap-2.5 rounded-xl border border-yellow-500/20 bg-yellow-500/6 px-3 py-2.5 text-xs">
          <svg viewBox="0 0 16 16" fill="none" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div>
            <p className="font-medium text-yellow-400">Faucet SDK out of date</p>
            <p className="mt-0.5 text-yellow-400/60">
              Faucet is running <code className="rounded bg-white/6 px-1">{status.sdk.faucetVersion}</code>,
              latest is <code className="rounded bg-white/6 px-1">{status.sdk.latestVersion}</code>.
              CLI commands above use the latest automatically. Faucet functionality may differ until redeployed.
            </p>
          </div>
        </div>
      )}

      {/* Network status bar */}
      <div className="flex items-center justify-between rounded-xl border border-chartreuse/20 bg-chartreuse/3 px-3 py-2 text-xs text-zinc-500">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block h-2 w-2 rounded-full bg-chartreuse" />
          <span className="text-zinc-400">
            Chain {status.network.l1ChainId}
          </span>
          <span className="text-zinc-700">·</span>
          <span>
            Balance: {Number(status.l1BalanceEth).toFixed(4)} <span className="text-chartreuse">ETH</span>
          </span>
          {status.l1FeeJuiceBalance !== null && status.l1FeeJuiceBalance !== undefined && Number(status.l1FeeJuiceBalance) > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span title="L1 Fee Juice ERC20 balance held by the faucet wallet">
                {Number(status.l1FeeJuiceBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-chartreuse">Fee Juice</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
