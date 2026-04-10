"use client";

import { useEffect, useState } from "react";

type StatusData = {
  healthy: boolean;
  faucetAddress: string;
  l1BalanceEth: string;
  assets: { name: string; available: boolean }[];
  network: {
    l1ChainId: number;
    aztecNodeUrl: string;
  };
};

const ASSET_LABELS: Record<string, string> = {
  eth: "L1 ETH",
  "fee-juice": "Fee Juice",
};

// Default skeleton structure — matches the shape of real data
const SKELETON_ASSETS = [
  { name: "eth", available: false },
  { name: "fee-juice", available: false },
];

function Sk({ w = "w-24", h = "h-3" }: { w?: string; h?: string }) {
  return <span className={`skeleton inline-block ${w} ${h} rounded`} />;
}

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1.5 rounded border border-white/8 px-1.5 py-0.5 text-[10px] text-zinc-600 transition-colors hover:border-chartreuse/25 hover:text-chartreuse"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/4 py-3 last:border-0">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-right text-xs text-zinc-300">{children}</span>
    </div>
  );
}

export function StatusView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => { setData(d); setError(false); })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  const loading = !data && !error;
  const assets = data?.assets ?? SKELETON_ASSETS;

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Faucet
      </button>

      <div className="glass-card rounded-2xl p-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">API Status</h2>
          {error ? (
            <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              Unreachable
            </span>
          ) : data ? (
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${
              data.healthy
                ? "border-chartreuse/20 bg-chartreuse/8 text-chartreuse"
                : "border-red-500/20 bg-red-500/8 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${data.healthy ? "bg-chartreuse" : "bg-red-400"}`} />
              {data.healthy ? "Healthy" : "Degraded"}
            </span>
          ) : (
            <Sk w="w-20" h="h-5" />
          )}
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-400">
            Could not reach the faucet API. Check server configuration.
          </p>
        )}

        {/* Faucet section — always rendered */}
        <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
          Faucet
        </div>
        <div className="rounded-xl border border-white/5 bg-white/2 px-4">
          <Row label="Address">
            {loading ? (
              <Sk w="w-48" h="h-3" />
            ) : data ? (
              <>
                <span className="font-mono text-[11px]">
                  {data.faucetAddress.slice(0, 10)}…{data.faucetAddress.slice(-8)}
                </span>
                <CopyInline text={data.faucetAddress} />
              </>
            ) : "—"}
          </Row>
          <Row label="L1 Balance">
            {loading ? (
              <Sk w="w-28" h="h-3" />
            ) : data ? (
              `${Number(data.l1BalanceEth).toFixed(6)} ETH`
            ) : "—"}
          </Row>
        </div>

        {/* Assets section — always rendered */}
        <div className="mb-1 mt-5 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
          Assets
        </div>
        <div className="rounded-xl border border-white/5 bg-white/2 px-4">
          {assets.filter((a) => a.name !== "test-token").map((a) => (
            <Row key={a.name} label={ASSET_LABELS[a.name] ?? a.name}>
              {loading ? (
                <Sk w="w-20" h="h-5" />
              ) : (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  a.available
                    ? "border-chartreuse/20 bg-chartreuse/8 text-chartreuse"
                    : "border-white/8 bg-white/4 text-zinc-600"
                }`}>
                  {a.available ? "Available" : "Unavailable"}
                </span>
              )}
            </Row>
          ))}
        </div>

        {/* Network section — always rendered */}
        <div className="mb-1 mt-5 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
          Network
        </div>
        <div className="rounded-xl border border-white/5 bg-white/2 px-4">
          <Row label="L1 Chain ID">
            {loading ? (
              <Sk w="w-16" h="h-3" />
            ) : data ? (
              <span className="font-mono">{data.network.l1ChainId}</span>
            ) : "—"}
          </Row>
          <Row label="Aztec Node">
            {loading ? (
              <Sk w="w-40" h="h-3" />
            ) : data ? (
              <span className="max-w-[16rem] break-all font-mono text-[11px] text-zinc-400">
                {data.network.aztecNodeUrl}
              </span>
            ) : "—"}
          </Row>
        </div>
      </div>
    </div>
  );
}
