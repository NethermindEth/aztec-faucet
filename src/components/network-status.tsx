"use client";

import { useEffect, useState } from "react";

type StatusData = {
  healthy: boolean;
  faucetAddress: string;
  l1BalanceEth: string;
  assets: { name: string; available: boolean }[];
  network: {
    l1RpcUrl: string;
    l1ChainId: number;
    aztecNodeUrl: string;
  };
};

export function NetworkStatus() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    fetch("/api/status", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Status API returned ${res.status}`);
        return res.json();
      })
      .then(setStatus)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
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
  }, []);

  if (error) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/4 px-3 py-2 text-xs text-red-400">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        Faucet unavailable — check server configuration
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
    <div className="mb-4 flex items-center justify-between rounded-xl border border-white/6 px-3 py-2 text-xs text-zinc-500">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-chartreuse" />
        <span className="text-zinc-400">
          Chain {status.network.l1ChainId}
        </span>
        <span className="text-zinc-700">·</span>
        <span>Balance: {Number(status.l1BalanceEth).toFixed(4)} ETH</span>
      </div>
      <div className="flex gap-1.5">
        {status.assets.map((a) => (
          <span
            key={a.name}
            className={`rounded-md px-1.5 py-0.5 text-[10px] ${
              a.available
                ? "bg-chartreuse/10 text-chartreuse"
                : "bg-white/4 text-zinc-600"
            }`}
          >
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
