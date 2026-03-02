"use client";

import { useState, useCallback } from "react";

type ClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
};

type DripResultData = {
  success: boolean;
  asset: string;
  txHash?: string;
  claimData?: ClaimData;
};

type DripResultProps = {
  result: DripResultData | null;
  error: string | null;
  retryAfter: number | null;
  onReset?: () => void;
};

function formatMs(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-white/8 px-2 py-1 text-xs text-zinc-500 transition-all hover:border-chartreuse/30 hover:text-chartreuse"
      title="Copy to clipboard"
    >
      {copied ? (
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
            <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </span>
      ) : "Copy"}
    </button>
  );
}

export function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <CopyButton text={value} />
      </div>
      <code className="block break-all rounded-lg border border-white/5 bg-white/3 px-3 py-2 text-xs leading-relaxed text-zinc-300">
        {value}
      </code>
    </div>
  );
}

const ASSET_LABELS: Record<string, string> = {
  eth: "L1 ETH",
  "fee-juice": "Fee Juice",
  "test-token": "Test Token",
};

const SEPOLIA_ETHERSCAN = "https://sepolia.etherscan.io/tx";

function truncateHash(hash: string): string {
  if (hash.length <= 22) return hash;
  return `${hash.slice(0, 12)}...${hash.slice(-10)}`;
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="w-full rounded-xl border border-white/8 px-4 py-2.5 text-sm text-zinc-400 transition-all hover:border-white/15 hover:bg-white/4 hover:text-white"
    >
      Request another drip
    </button>
  );
}

function EthResult({ txHash, onReset }: { txHash: string; onReset?: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between gap-5">
      {/* Top section */}
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aqua/30 bg-aqua/10">
              <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-aqua">
                <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">ETH Sent</span>
          </div>
          <span className="rounded-full border border-aqua/20 bg-aqua/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-aqua">
            Confirmed
          </span>
        </div>

        {/* Network row */}
        <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/2 px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chartreuse/60" style={{ animationDuration: "2.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-chartreuse" />
          </span>
          <span className="text-xs text-zinc-400">Sepolia Testnet</span>
          <span className="ml-auto font-mono text-xs text-zinc-600">11155111</span>
        </div>

        {/* Transaction hash */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Transaction Hash
            </p>
            <CopyButton text={txHash} />
          </div>
          <div className="rounded-xl border border-white/6 bg-white/2 px-3 py-2.5">
            <code className="block font-mono text-sm text-zinc-200">
              {truncateHash(txHash)}
            </code>
            <details className="mt-1.5">
              <summary className="cursor-pointer select-none text-[10px] text-zinc-600 transition-colors hover:text-zinc-400">
                Show full hash
              </summary>
              <code className="mt-1.5 block break-all text-[11px] leading-relaxed text-zinc-500">
                {txHash}
              </code>
            </details>
          </div>
        </div>

        {/* Etherscan link */}
        <a
          href={`${SEPOLIA_ETHERSCAN}/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between rounded-xl border border-white/8 bg-white/2 px-4 py-3 text-sm transition-all hover:border-aqua/30 hover:bg-aqua/5"
        >
          <span className="text-zinc-400 transition-colors group-hover:text-white">
            View on Sepolia Etherscan
          </span>
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-aqua">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {/* Bottom — reset button pinned to bottom */}
      {onReset && <ResetButton onReset={onReset} />}
    </div>
  );
}

function TestTokenResult({ txHash, onReset }: { txHash?: string; onReset?: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between gap-5">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aqua/30 bg-aqua/10">
              <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-aqua">
                <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Test Token Minted</span>
          </div>
          <span className="rounded-full border border-aqua/20 bg-aqua/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-aqua">
            Confirmed
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/2 px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orchid/60" style={{ animationDuration: "2.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orchid" />
          </span>
          <span className="text-xs text-zinc-400">Aztec L2 Devnet</span>
          <span className="ml-auto text-xs text-zinc-600">Public balance</span>
        </div>

        {txHash && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Transaction Hash
              </p>
              <CopyButton text={txHash} />
            </div>
            <div className="rounded-xl border border-white/6 bg-white/2 px-3 py-2.5">
              <code className="block font-mono text-sm text-zinc-200">
                {truncateHash(txHash)}
              </code>
              <details className="mt-1.5">
                <summary className="cursor-pointer select-none text-[10px] text-zinc-600 transition-colors hover:text-zinc-400">
                  Show full hash
                </summary>
                <code className="mt-1.5 block break-all text-[11px] leading-relaxed text-zinc-500">
                  {txHash}
                </code>
              </details>
            </div>
          </div>
        )}
      </div>

      {onReset && <ResetButton onReset={onReset} />}
    </div>
  );
}

export function DripResult({ result, error, retryAfter, onReset }: DripResultProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/6 p-4">
        <p className="text-sm font-medium text-red-400">{error}</p>
        {retryAfter && (
          <p className="mt-1 text-xs text-red-400/70">
            Try again in {formatMs(retryAfter)}
          </p>
        )}
      </div>
    );
  }

  if (!result) return null;

  if (result.asset === "eth" && result.txHash) {
    return <EthResult txHash={result.txHash} onReset={onReset} />;
  }

  if (result.asset === "test-token") {
    return <TestTokenResult txHash={result.txHash} onReset={onReset} />;
  }

  // fee-juice fallback
  const assetLabel = ASSET_LABELS[result.asset] ?? result.asset;

  return (
    <div className="flex h-full flex-col justify-between gap-5">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aqua/30 bg-aqua/10">
            <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-aqua">
              <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white">{assetLabel} Sent</span>
        </div>

        {result.txHash && <DataField label="Transaction Hash" value={result.txHash} />}

        {result.claimData && (
          <div className="space-y-3">
            <div className="rounded-lg border border-orchid/15 bg-orchid/4 px-3 py-2.5">
              <p className="text-xs font-medium text-orchid">Action required: Claim on L2</p>
              <p className="mt-1 text-xs text-orchid/60">
                Use{" "}
                <code className="rounded bg-white/6 px-1">FeeJuicePaymentMethodWithClaim</code>{" "}
                from the Aztec SDK.
              </p>
            </div>
            <DataField label="Claim Amount" value={result.claimData.claimAmount} />
            <DataField label="Claim Secret" value={result.claimData.claimSecretHex} />
            <DataField label="Claim Secret Hash" value={result.claimData.claimSecretHashHex} />
            <DataField label="Message Hash" value={result.claimData.messageHashHex} />
            <DataField label="Message Leaf Index" value={result.claimData.messageLeafIndex} />
          </div>
        )}
      </div>

      {onReset && <ResetButton onReset={onReset} />}
    </div>
  );
}

export type { DripResultData };
