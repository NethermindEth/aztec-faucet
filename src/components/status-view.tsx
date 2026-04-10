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

const SKELETON_ASSETS = [
  { name: "eth", available: false },
  { name: "fee-juice", available: false },
];

function Sk({ w = "w-24", h = "h-3" }: { w?: string; h?: string }) {
  return <span className={`skeleton inline-block ${w} ${h}`} />;
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
      className="ml-1.5 border border-outline-variant px-2 py-0.5 font-label text-[10px] uppercase tracking-wider text-on-surface-variant transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-outline-variant/20 py-3 last:border-0">
      <span className="shrink-0 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
        {label}
      </span>
      <span className="text-right font-label text-xs text-on-surface">{children}</span>
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
    <div className="mx-auto w-full max-w-md">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-2 font-label text-sm uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Faucet
      </button>

      <div className="bg-surface-container p-5 sm:p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-outline-variant pb-6">
          <h2 className="font-headline text-2xl uppercase tracking-tight text-on-surface">API Status</h2>
          {error ? (
            <span className="flex items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest text-red-400">
              <span className="h-1.5 w-1.5 bg-red-400" />
              Unreachable
            </span>
          ) : data ? (
            <span className={`flex items-center gap-1.5 border px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest ${
              data.healthy
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 ${data.healthy ? "bg-accent" : "bg-red-400"}`} />
              {data.healthy ? "Healthy" : "Degraded"}
            </span>
          ) : (
            <Sk w="w-20" h="h-5" />
          )}
        </div>

        {error && (
          <p className="mb-4 font-body text-sm text-red-400">
            Could not reach the faucet API. Check server configuration.
          </p>
        )}

        {/* Faucet section */}
        <div className="mb-1 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
          Faucet
        </div>
        <div className="bg-surface-low px-4">
          <Row label="Address">
            {loading ? (
              <Sk w="w-48" h="h-3" />
            ) : data ? (
              <>
                <span className="font-label text-[11px]">
                  {data.faucetAddress.slice(0, 10)}...{data.faucetAddress.slice(-8)}
                </span>
                <CopyInline text={data.faucetAddress} />
              </>
            ) : null}
          </Row>
          <Row label="L1 Balance">
            {loading ? (
              <Sk w="w-28" h="h-3" />
            ) : data ? (
              `${Number(data.l1BalanceEth).toFixed(6)} ETH`
            ) : null}
          </Row>
        </div>

        {/* Assets section */}
        <div className="mb-1 mt-5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
          Assets
        </div>
        <div className="bg-surface-low px-4">
          {assets.filter((a) => a.name !== "test-token").map((a) => (
            <Row key={a.name} label={ASSET_LABELS[a.name] ?? a.name}>
              {loading ? (
                <Sk w="w-20" h="h-5" />
              ) : (
                <span className={`border px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-wider ${
                  a.available
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-outline-variant bg-surface-highest text-on-surface-variant opacity-50"
                }`}>
                  {a.available ? "Available" : "Unavailable"}
                </span>
              )}
            </Row>
          ))}
        </div>

        {/* Network section */}
        <div className="mb-1 mt-5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
          Network
        </div>
        <div className="bg-surface-low px-4">
          <Row label="L1 Chain ID">
            {loading ? (
              <Sk w="w-16" h="h-3" />
            ) : data ? (
              <span className="font-label">{data.network.l1ChainId}</span>
            ) : null}
          </Row>
          <Row label="Aztec Node">
            {loading ? (
              <Sk w="w-40" h="h-3" />
            ) : data ? (
              <span className="max-w-[10rem] sm:max-w-[16rem] break-all font-label text-[11px] text-on-surface-variant">
                {data.network.aztecNodeUrl}
              </span>
            ) : null}
          </Row>
        </div>
      </div>
    </div>
  );
}
