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
    <div className="mx-auto w-full">
      <div className="bg-surface-container p-5 sm:p-6 shadow-2xl">
        <div className="mb-4 border-b border-outline-variant pb-4">
          <h2 className="font-headline text-2xl uppercase tracking-tight text-on-surface">Check Fee Juice Balance</h2>
          <p className="mt-1 font-label text-xs text-on-surface-variant opacity-60 uppercase tracking-wider">
            Fee Juice is public state, readable directly from the Aztec node.
          </p>
        </div>

        {/* Address input */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Aztec Address
            </label>
            <div className="focus-glow-line relative">
              <input
                type="text"
                value={address}
                onChange={(e) => { setAddress(e.target.value); setResult(null); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCheck(); }}
                placeholder="0x + 64 hex characters"
                spellCheck={false}
                className="stitch-input text-sm sm:text-base pr-20! sm:pr-28!"
              />
              <button
                type="button"
                onClick={async () => {
                  const text = await navigator.clipboard.readText().catch(() => "");
                  if (text) { setAddress(text.trim()); setResult(null); setError(null); }
                }}
                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 border border-outline-variant bg-surface-high px-2 sm:px-3 py-1.5 font-label text-[10px] sm:text-[11px] uppercase tracking-wider text-on-surface-variant transition-all hover:border-accent hover:text-accent"
              >
                Paste
              </button>
            </div>
            {isDirty && !isValid && (
              <p className="mt-1.5 font-label text-[11px] text-red-400">
                Must be 0x followed by exactly 64 hex characters.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleCheck}
            disabled={!isValid || loading}
            className="btn-primary w-full py-4 text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                FETCHING BALANCE...
              </span>
            ) : "CHECK BALANCE"}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-3 border-l-4 border-red-500 bg-red-500/10 p-3 animate-panel-state-in">
            <p className="font-label text-sm text-red-400">Failed to fetch balance</p>
            <p className="mt-0.5 font-label text-xs text-red-400/70">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4 space-y-3 animate-panel-state-in">
            {/* Balance card */}
            <div className="bg-surface-low p-4">
              {/* Network row */}
              <div className="mb-3 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping bg-accent/60" style={{ animationDuration: "2.5s" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
                </span>
                <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant opacity-60">Aztec L2 Testnet</span>
              </div>

              {/* Balance number */}
              <div className="flex items-baseline gap-2">
                <span className={`font-headline text-3xl sm:text-4xl italic tracking-tight break-all ${isZero ? "text-on-surface-variant opacity-50" : "text-on-surface"}`}>
                  {result.balanceFormatted}
                </span>
                <span className="font-label text-sm text-on-surface-variant opacity-60">Fee Juice</span>
              </div>

              {isZero && (
                <p className="mt-2 font-label text-xs text-on-surface-variant opacity-40">
                  Zero balance. If you just bridged, wait ~2 min for the L1 to L2 message to land.
                </p>
              )}

              {/* Checked address + deployment status */}
              <div className="mt-3 space-y-1.5 border-t border-outline-variant/30 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">Address</span>
                  <code className="font-label text-[11px] text-on-surface-variant">
                    {checkedAddress?.slice(0, 10)}...{checkedAddress?.slice(-8)}
                  </code>
                </div>
                {result.isDeployed !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">Status</span>
                    {result.isDeployed ? (
                      <span className="flex items-center gap-1.5 font-label text-[11px] text-emerald-400">
                        <span className="h-1.5 w-1.5 bg-emerald-400" />
                        Deployed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-label text-[11px] text-amber-400">
                        <span className="h-1.5 w-1.5 bg-amber-400" />
                        Not Deployed
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CLI command */}
            <details className="group bg-surface-low">
              <summary className="cursor-pointer px-4 py-2.5 font-label text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent">
                Run this from your terminal instead
              </summary>
              <div className="border-t border-outline-variant/30 space-y-0">
                <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-2">
                  <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">curl one-liner</span>
                  <CopyButton text={makeBalanceCurl(trimmed)} />
                </div>
                <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-on-surface-variant font-label">
                  <code>{makeBalanceCurl(trimmed)}</code>
                </pre>
                <div className="flex items-center justify-between border-t border-b border-outline-variant/20 px-4 py-2">
                  <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">self-contained</span>
                  <CopyButton text={makeBalanceCmd(trimmed)} />
                </div>
                <pre className="max-h-40 overflow-auto px-4 py-3 text-[11px] leading-relaxed text-on-surface-variant font-label">
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
