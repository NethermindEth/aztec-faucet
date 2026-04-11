"use client";

import { useEffect, useState } from "react";
import { NETWORK_LABEL } from "@/lib/network-config";

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
      className="shrink-0 ml-1 border border-outline-variant px-1.5 py-0.5 font-label text-[9px] uppercase tracking-wider text-on-surface-variant transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 border-b border-outline-variant/20 py-2.5 last:border-0 overflow-hidden">
      <span className="shrink-0 font-label text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
        {label}
      </span>
      <span className="flex items-center justify-end gap-1.5 font-label text-[11px] text-on-surface min-w-0 truncate">{children}</span>
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
      <div className="flex items-center gap-0 border border-outline-variant/40">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`flex-1 py-2.5 font-label text-xs font-bold uppercase tracking-widest transition-all ${
            tab === "overview"
              ? "bg-surface-high text-accent"
              : "text-on-surface-variant opacity-50 hover:opacity-80"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("contracts")}
          className={`flex-1 py-2.5 font-label text-xs font-bold uppercase tracking-widest transition-all ${
            tab === "contracts"
              ? "bg-surface-high text-accent"
              : "text-on-surface-variant opacity-50 hover:opacity-80"
          }`}
        >
          Contracts
        </button>
      </div>

      <div key={tab} className="animate-panel-state-in">
      {tab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          {/* Fee Rates card */}
          <div className="bg-surface-container border border-outline-variant/40 p-5 shadow-2xl flex flex-col">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-headline text-xl uppercase tracking-tight text-on-surface">Live Fee Rates</h2>
                <p className="mt-1 font-label text-[10px] text-on-surface-variant opacity-50 uppercase tracking-widest">
                  Current minimum fees on the Aztec {NETWORK_LABEL.toLowerCase()}.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {fees && (
                  <span className="border border-accent/30 bg-accent/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest text-accent">
                    Block {fees.blockNumber}
                  </span>
                )}
                {feesUpdatedAt && (
                  <span className="font-label text-[10px] text-on-surface-variant opacity-40">
                    updated {timeAgo(feesUpdatedAt, now)}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-surface-low border border-outline-variant/20 px-4">
              <Row label="Fee per DA Mana">
                {feesLoading ? <Sk w="w-28" /> :
                 feesError ? <span className="text-red-400">Unavailable</span> :
                 fees ? (
                   <span className="font-label">
                     {formatGas(fees.feePerDaGas)}
                     {fees.feePerDaGas === "0" && (
                       <span className="ml-1.5 text-on-surface-variant opacity-40">(free on testnet)</span>
                     )}
                   </span>
                 ) : null}
              </Row>
              <Row label="Fee per L2 Mana">
                {feesLoading ? <Sk w="w-28" /> :
                 feesError ? <span className="text-red-400">Unavailable</span> :
                 fees ? (
                   <span className="font-label">{formatGas(fees.feePerL2Gas)}</span>
                 ) : null}
              </Row>
            </div>

            <div className="mt-4 bg-surface-low border border-outline-variant/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setFeesOpen(!feesOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent">How are fees calculated?</span>
                <span className={`text-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${feesOpen ? "rotate-45" : ""}`}>
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
                  <div className="space-y-1.5 border-t border-outline-variant/20 px-4 pb-3 pt-2 font-body text-xs text-on-surface-variant opacity-70">
                    <p>
                      <span className="text-on-surface font-medium">DA mana:</span> cost of publishing transaction data to the data availability layer. Currently free on testnet.
                    </p>
                    <p>
                      <span className="text-on-surface font-medium">L2 mana:</span> cost of executing the transaction on Aztec L2.
                    </p>
                    <p className="text-on-surface-variant opacity-50 pt-0.5">
                      Total fee = <code className="bg-surface-highest px-1 text-on-surface-variant">(daMana x feePerDaMana) + (l2Mana x feePerL2Mana)</code>
                    </p>
                    <p className="text-on-surface-variant opacity-50">
                      The SDK uses &quot;gas&quot; in variable names (e.g. feePerDaGas) but mana is the correct term.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Node Health card */}
          <div className="bg-surface-container border border-outline-variant/40 p-5 shadow-2xl flex flex-col">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-headline text-xl uppercase tracking-tight text-on-surface">Node Health</h2>
                <p className="mt-1 font-label text-[10px] text-on-surface-variant opacity-50 uppercase tracking-widest">
                  Live status of the Aztec {NETWORK_LABEL.toLowerCase()} node.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {nodeInfo ? (
                  <span className="flex items-center gap-1.5 border border-accent/30 bg-accent/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest text-accent">
                    <span className="h-1.5 w-1.5 bg-accent" />
                    Online
                  </span>
                ) : nodeError ? (
                  <span className="flex items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest text-red-400">
                    <span className="h-1.5 w-1.5 bg-red-400" />
                    Unreachable
                  </span>
                ) : (
                  <Sk w="w-20" h="h-5" />
                )}
                {nodeUpdatedAt && (
                  <span className="font-label text-[10px] text-on-surface-variant opacity-40">
                    updated {timeAgo(nodeUpdatedAt, now)}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-surface-low border border-outline-variant/20 px-4">
              <Row label="Version">
                {nodeLoading ? <Sk w="w-36" /> :
                 nodeError ? <span className="text-red-400">n/a</span> :
                 <span className="font-label text-[11px]">{nodeInfo?.nodeVersion}</span>}
              </Row>
              <Row label="Block Height">
                {nodeLoading ? <Sk w="w-20" /> :
                 nodeError ? <span className="text-red-400">n/a</span> :
                 <span className="font-label">{nodeInfo?.blockNumber.toLocaleString()}</span>}
              </Row>
              <Row label="L1 Chain">
                {nodeLoading ? <Sk w="w-16" /> :
                 nodeError ? <span className="text-red-400">n/a</span> :
                 <span className="font-label">Sepolia ({nodeInfo?.l1ChainId})</span>}
              </Row>
              <Row label="Rollup Version">
                {nodeLoading ? <Sk w="w-20" /> :
                 nodeError ? <span className="text-red-400">n/a</span> :
                 <span className="font-label">{nodeInfo?.rollupVersion}</span>}
              </Row>
            </div>
          </div>
        </div>
      )}

      {tab === "contracts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline text-xl uppercase tracking-tight text-on-surface">Contract Addresses</h2>
              <p className="mt-1 font-label text-[10px] text-on-surface-variant opacity-50 uppercase tracking-widest">
                All deployed protocol contract addresses on the Aztec {NETWORK_LABEL.toLowerCase()}.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {nodeInfo ? (
                <span className="border border-accent/30 bg-accent/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-widest text-accent">
                  Block {nodeInfo.blockNumber}
                </span>
              ) : nodeLoading ? (
                <Sk w="w-20" h="h-5" />
              ) : null}
              {nodeUpdatedAt && (
                <span className="font-label text-[10px] text-on-surface-variant opacity-40">
                  updated {timeAgo(nodeUpdatedAt, now)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <div className="bg-surface-container border border-outline-variant/40 p-4 sm:p-5 shadow-2xl">
              <div className="mb-3 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
                L1 Contracts (Sepolia)
              </div>
              <div className="bg-surface-low border border-outline-variant/20 px-4">
                {nodeLoading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <Row key={i} label=""><Sk w="w-32" /></Row>
                  ))
                ) : nodeError ? (
                  <div className="py-3 font-label text-xs text-red-400">Could not load contract addresses.</div>
                ) : nodeInfo ? (
                  Object.entries(L1_CONTRACT_LABELS).map(([key, label]) => {
                    const addr = nodeInfo.l1Contracts[key];
                    if (!addr) return null;
                    return (
                      <Row key={key} label={label}>
                        <span className="font-label text-[11px]">
                          {addr.slice(0, 8)}...{addr.slice(-6)}
                        </span>
                        <CopyInline text={addr} />
                      </Row>
                    );
                  })
                ) : null}
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant/40 p-4 sm:p-5 shadow-2xl">
              <div className="mb-3 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
                L2 Protocol Contracts
              </div>
              <div className="bg-surface-low border border-outline-variant/20 px-4">
                {nodeLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Row key={i} label=""><Sk w="w-32" /></Row>
                  ))
                ) : nodeError ? (
                  <div className="py-3 font-label text-xs text-red-400">Could not load contract addresses.</div>
                ) : nodeInfo ? (
                  Object.entries(L2_CONTRACT_LABELS).map(([key, label]) => {
                    const addr = nodeInfo.l2Contracts[key];
                    if (!addr) return null;
                    return (
                      <Row key={key} label={label}>
                        <span className="font-label text-[11px]">
                          {addr.slice(0, 8)}...{addr.slice(-6)}
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
