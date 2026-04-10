"use client";

import { useState } from "react";
import { CopyButton } from "./drip-result";
import { NODE_URL, NPM_TAG } from "@/lib/network-config";

const AZTEC_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const GITHUB_RAW = `https://raw.githubusercontent.com/NethermindEth/aztec-faucet/${process.env.NEXT_PUBLIC_GITHUB_BRANCH ?? "main"}`;

function makeBalanceCurl(address: string): string {
  return `curl -fsSL ${GITHUB_RAW}/sh/testnet/check-balance.sh | sh -s -- --address ${address}`;
}

function makeBalanceCmd(address: string): string {
  return `mkdir -p ~/.aztec-devtools && cd ~/.aztec-devtools && \\
echo '{"type":"module"}' > package.json && \\
npm install --no-package-lock @aztec/aztec.js@${NPM_TAG} @aztec/stdlib@${NPM_TAG} --silent && \\
node --input-type=module << 'AZTEC_EOF'
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
const node = createAztecNodeClient("${NODE_URL}");
const owner = AztecAddress.fromString("${address}");
const slot = await deriveStorageSlotInMap(new Fr(1), owner);
const raw = (await node.getPublicStorageAt("latest", AztecAddress.fromBigInt(5n), slot)).toBigInt();
const s = raw.toString().padStart(19, "0");
console.log("Fee Juice:", (s.slice(0, s.length - 18) || "0") + "." + s.slice(s.length - 18, s.length - 14));
AZTEC_EOF`;
}

type BalanceResult = {
  balanceFormatted: string;
  balanceRaw: string;
  isDeployed?: boolean;
};

export function BalanceView() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAddress, setCheckedAddress] = useState<string | null>(null);

  const trimmed = address.trim();
  const isValid = AZTEC_ADDRESS_RE.test(trimmed);
  const isDirty = trimmed.length > 0;

  async function handleCheck() {
    if (!isValid || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setCheckedAddress(trimmed);
    try {
      const res = await fetch(`/api/balance?address=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch balance");
      setResult({ balanceFormatted: data.balanceFormatted, balanceRaw: data.balanceRaw, isDeployed: data.isDeployed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const isZero = result?.balanceRaw === "0";

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="glass-card rounded-2xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-white">Check Fee Juice Balance</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Fee Juice is public state, readable directly from the Aztec node.
          </p>
        </div>

        {/* Address input */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Aztec Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => { setAddress(e.target.value); setResult(null); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCheck(); }}
                placeholder="0x + 64 hex characters"
                spellCheck={false}
                className={`w-full rounded-xl border bg-white/3 py-3 pl-4 pr-16 font-mono text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:bg-white/5 ${
                  isDirty && !isValid
                    ? "border-red-500/40 focus:border-red-500/60"
                    : isValid
                      ? "border-chartreuse/30 focus:border-chartreuse/50"
                      : "border-white/8 focus:border-white/20"
                }`}
              />
              <button
                type="button"
                onClick={async () => {
                  const text = await navigator.clipboard.readText().catch(() => "");
                  if (text) { setAddress(text.trim()); setResult(null); setError(null); }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/8 px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:border-chartreuse/25 hover:text-chartreuse"
              >
                Paste
              </button>
            </div>
            {isDirty && !isValid && (
              <p className="mt-1.5 text-[11px] text-red-400">
                Must be 0x followed by exactly 64 hex characters.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleCheck}
            disabled={!isValid || loading}
            className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Fetching balance...
              </span>
            ) : "Check Balance"}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-3 animate-panel-state-in">
            <p className="text-sm font-medium text-red-400">Failed to fetch balance</p>
            <p className="mt-0.5 text-xs text-red-400/70">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-5 space-y-3 animate-panel-state-in">
            {/* Balance card */}
            <div className="rounded-xl border border-white/6 bg-white/2 p-5">
              {/* Network row */}
              <div className="mb-4 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orchid/60" style={{ animationDuration: "2.5s" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orchid" />
                </span>
                <span className="text-xs text-zinc-500">Aztec L2 Testnet</span>
              </div>

              {/* Balance number */}
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-4xl font-semibold tracking-tight ${isZero ? "text-zinc-500" : "text-white"}`}>
                  {result.balanceFormatted}
                </span>
                <span className="text-sm text-zinc-500">Fee Juice</span>
              </div>

              {isZero && (
                <p className="mt-2 text-xs text-zinc-600">
                  Zero balance. If you just bridged, wait ~2 min for the L1 to L2 message to land.
                </p>
              )}

              {/* Checked address + deployment status */}
              <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Address</span>
                  <code className="font-mono text-[11px] text-zinc-500">
                    {checkedAddress?.slice(0, 10)}…{checkedAddress?.slice(-8)}
                  </code>
                </div>
                {result.isDeployed !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Status</span>
                    {result.isDeployed ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Deployed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Not Deployed
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CLI command — collapsible */}
            <details className="group rounded-xl border border-white/6 bg-white/2">
              <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300">
                Run this from your terminal instead
              </summary>
              <div className="border-t border-white/5 space-y-0">
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">quick start, curl, no clone</span>
                  <CopyButton text={makeBalanceCurl(trimmed)} />
                </div>
                <pre className="overflow-x-auto px-3 py-3 text-[11px] leading-relaxed text-zinc-400">
                  <code>{makeBalanceCurl(trimmed)}</code>
                </pre>
                <div className="flex items-center justify-between border-t border-b border-white/5 px-3 py-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">self-contained, no clone needed</span>
                  <CopyButton text={makeBalanceCmd(trimmed)} />
                </div>
                <pre className="max-h-40 overflow-auto px-3 py-3 text-[11px] leading-relaxed text-zinc-400">
                  <code>{makeBalanceCmd(trimmed)}</code>
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
