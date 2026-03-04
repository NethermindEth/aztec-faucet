"use client";

import { useEffect, useState } from "react";

type FeesData = {
  feePerDaGas: string;
  feePerL2Gas: string;
  blockNumber: number;
};

type NodeInfoData = {
  nodeVersion: string;
  l1ChainId: number;
  rollupVersion: number;
  blockNumber: number;
  l1Contracts: Record<string, string>;
  l2Contracts: Record<string, string>;
};

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
      <span className="flex items-center justify-end gap-2 text-xs text-zinc-300">{children}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
      {children}
    </div>
  );
}

const L1_CONTRACT_LABELS: Record<string, string> = {
  rollupAddress: "Rollup",
  registryAddress: "Registry",
  inboxAddress: "Inbox",
  outboxAddress: "Outbox",
  feeJuiceAddress: "Fee Juice (L1)",
  feeJuicePortalAddress: "Fee Juice Portal",
  stakingAssetAddress: "Staking Asset",
};

const L2_CONTRACT_LABELS: Record<string, string> = {
  feeJuice: "Fee Juice",
  instanceRegistry: "Instance Registry",
  classRegistry: "Class Registry",
  multiCallEntrypoint: "MultiCall Entrypoint",
};

function formatGas(raw: string): string {
  const n = BigInt(raw);
  if (n === 0n) return "0";
  if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(since: Date, now: Date): string {
  const s = Math.floor((now.getTime() - since.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const REFRESH_INTERVAL = 15_000;

export function NetworkView() {
  const [tab, setTab] = useState<"overview" | "contracts">("overview");
  const [feesOpen, setFeesOpen] = useState(false);
  const [fees, setFees] = useState<FeesData | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfoData | null>(null);
  const [feesError, setFeesError] = useState(false);
  const [nodeError, setNodeError] = useState(false);
  const [feesUpdatedAt, setFeesUpdatedAt] = useState<Date | null>(null);
  const [nodeUpdatedAt, setNodeUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Tick every second so "Xs ago" stays live
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function fetchAll() {
      fetch("/api/fees")
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((data) => { if (!cancelled) { setFees(data); setFeesError(false); setFeesUpdatedAt(new Date()); } })
        .catch(() => { if (!cancelled) setFeesError(true); });

      fetch("/api/node-info")
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((data) => { if (!cancelled) { setNodeInfo(data); setNodeError(false); setNodeUpdatedAt(new Date()); } })
        .catch(() => { if (!cancelled) setNodeError(true); });
    }

    fetchAll();
    const timer = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const feesLoading = !fees && !feesError;
  const nodeLoading = !nodeInfo && !nodeError;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 rounded-full border border-white/6 bg-white/2 p-1">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
            tab === "overview"
              ? "bg-white/10 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("contracts")}
          className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-all ${
            tab === "contracts"
              ? "bg-white/10 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Contracts
        </button>
      </div>

      <div key={tab} className="animate-panel-state-in">
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4 items-stretch">
          {/* Fee Rates card */}
          <div className="glass-card rounded-2xl p-6 flex flex-col">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Live Fee Rates</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Current minimum fees on the Aztec devnet. Use these to calculate transaction costs.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {fees && (
                  <span className="rounded-full border border-chartreuse/20 bg-chartreuse/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-chartreuse">
                    Block {fees.blockNumber}
                  </span>
                )}
                {feesUpdatedAt && (
                  <span className="text-[10px] text-zinc-600">
                    updated {timeAgo(feesUpdatedAt, now)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/2 px-4">
              <Row label="Fee per DA Mana">
                {feesLoading ? <Sk w="w-28" /> :
                 feesError ? <span className="text-red-400">Unavailable</span> :
                 fees ? (
                   <span className="font-mono">
                     {formatGas(fees.feePerDaGas)}
                     {fees.feePerDaGas === "0" && (
                       <span className="ml-1.5 text-zinc-600">(free on devnet)</span>
                     )}
                   </span>
                 ) : "—"}
              </Row>
              <Row label="Fee per L2 Mana">
                {feesLoading ? <Sk w="w-28" /> :
                 feesError ? <span className="text-red-400">Unavailable</span> :
                 fees ? (
                   <span className="font-mono">{formatGas(fees.feePerL2Gas)}</span>
                 ) : "—"}
              </Row>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/2 overflow-hidden">
              <button
                type="button"
                onClick={() => setFeesOpen(!feesOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300">How are fees calculated?</span>
                <span className={`text-chartreuse transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${feesOpen ? "rotate-45" : ""}`}>
                  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ gridTemplateRows: feesOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1.5 border-t border-white/5 px-4 pb-3 pt-2 text-xs text-zinc-500">
                    <p>
                      <span className="text-zinc-400 font-medium">DA mana:</span> cost of publishing transaction data to the data availability layer. Currently free on devnet.
                    </p>
                    <p>
                      <span className="text-zinc-400 font-medium">L2 mana:</span> cost of executing the transaction on Aztec L2.
                    </p>
                    <p className="text-zinc-600 pt-0.5">
                      Total fee = <code className="rounded bg-white/5 px-1 text-zinc-400">(daMana × feePerDaMana) + (l2Mana × feePerL2Mana)</code>
                    </p>
                    <p className="text-zinc-600">
                      The SDK uses &quot;gas&quot; in variable names (e.g. feePerDaGas) but mana is the correct term.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Node Health card */}
          <div className="glass-card rounded-2xl p-6 flex flex-col">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Node Health</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Live status of the Aztec devnet node.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {nodeInfo ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-chartreuse/20 bg-chartreuse/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-chartreuse">
                    <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
                    Online
                  </span>
                ) : nodeError ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    Unreachable
                  </span>
                ) : (
                  <Sk w="w-20" h="h-5" />
                )}
                {nodeUpdatedAt && (
                  <span className="text-[10px] text-zinc-600">
                    updated {timeAgo(nodeUpdatedAt, now)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/2 px-4">
              <Row label="Version">
                {nodeLoading ? <Sk w="w-36" /> :
                 nodeError ? <span className="text-red-400">—</span> :
                 <span className="font-mono text-[11px]">{nodeInfo?.nodeVersion}</span>}
              </Row>
              <Row label="Block Height">
                {nodeLoading ? <Sk w="w-20" /> :
                 nodeError ? <span className="text-red-400">—</span> :
                 <span className="font-mono">{nodeInfo?.blockNumber.toLocaleString()}</span>}
              </Row>
              <Row label="L1 Chain">
                {nodeLoading ? <Sk w="w-16" /> :
                 nodeError ? <span className="text-red-400">—</span> :
                 <span className="font-mono">Sepolia ({nodeInfo?.l1ChainId})</span>}
              </Row>
              <Row label="Rollup Version">
                {nodeLoading ? <Sk w="w-20" /> :
                 nodeError ? <span className="text-red-400">—</span> :
                 <span className="font-mono">{nodeInfo?.rollupVersion}</span>}
              </Row>
            </div>
          </div>
        </div>
      )}

      {tab === "contracts" && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Contract Addresses</h2>
              <p className="mt-1 text-xs text-zinc-500">
                All deployed protocol contract addresses on the Aztec devnet.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {nodeInfo ? (
                <span className="rounded-full border border-chartreuse/20 bg-chartreuse/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-chartreuse">
                  Block {nodeInfo.blockNumber}
                </span>
              ) : nodeLoading ? (
                <Sk w="w-20" h="h-5" />
              ) : null}
              {nodeUpdatedAt && (
                <span className="text-[10px] text-zinc-600">
                  updated {timeAgo(nodeUpdatedAt, now)}
                </span>
              )}
            </div>
          </div>

          {/* Side-by-side contract cards */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* L1 card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                L1 Contracts (Sepolia)
              </div>
              <div className="rounded-xl border border-white/5 bg-white/2 px-4">
                {nodeLoading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <Row key={i} label=""><Sk w="w-32" /></Row>
                  ))
                ) : nodeError ? (
                  <div className="py-3 text-xs text-red-400">Could not load contract addresses.</div>
                ) : nodeInfo ? (
                  Object.entries(L1_CONTRACT_LABELS).map(([key, label]) => {
                    const addr = nodeInfo.l1Contracts[key];
                    if (!addr) return null;
                    return (
                      <Row key={key} label={label}>
                        <span className="font-mono text-[11px]">
                          {addr.slice(0, 10)}…{addr.slice(-8)}
                        </span>
                        <CopyInline text={addr} />
                      </Row>
                    );
                  })
                ) : null}
              </div>
            </div>

            {/* L2 card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                L2 Protocol Contracts
              </div>
              <div className="rounded-xl border border-white/5 bg-white/2 px-4">
                {nodeLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Row key={i} label=""><Sk w="w-32" /></Row>
                  ))
                ) : nodeError ? (
                  <div className="py-3 text-xs text-red-400">Could not load contract addresses.</div>
                ) : nodeInfo ? (
                  Object.entries(L2_CONTRACT_LABELS).map(([key, label]) => {
                    const addr = nodeInfo.l2Contracts[key];
                    if (!addr) return null;
                    return (
                      <Row key={key} label={label}>
                        <span className="font-mono text-[11px]">
                          {addr.slice(0, 10)}…{addr.slice(-8)}
                        </span>
                        <CopyInline text={addr} />
                      </Row>
                    );
                  })
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

    </div>
  );
}
