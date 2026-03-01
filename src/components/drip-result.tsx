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
      className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:text-chartreuse"
      title="Copy to clipboard"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{label}</p>
        <CopyButton text={value} />
      </div>
      <code className="mt-0.5 block break-all rounded-lg bg-white/4 px-2 py-1.5 text-xs text-zinc-300">
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

export function DripResult({ result, error, retryAfter }: DripResultProps) {
  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/6 p-4">
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

  const assetLabel = ASSET_LABELS[result.asset] ?? result.asset;

  return (
    <div className="mt-6 rounded-xl border border-aqua/20 bg-aqua/4 p-4">
      <p className="text-sm font-medium text-aqua">
        {result.asset === "fee-juice"
          ? "Fee Juice bridged to L2 successfully!"
          : `${assetLabel} sent successfully!`}
      </p>

      {result.txHash && (
        <div className="mt-3">
          <DataField label="Transaction Hash" value={result.txHash} />
          {result.asset === "test-token" && (
            <p className="mt-2 text-xs text-zinc-500">
              This is an Aztec L2 transaction hash. The tokens have been minted
              to the recipient&apos;s public balance.
            </p>
          )}
        </div>
      )}

      {result.claimData && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-orchid/15 bg-orchid/4 px-3 py-2">
            <p className="text-xs font-medium text-orchid">
              Action required: Claim on L2
            </p>
            <p className="mt-1 text-xs text-orchid/60">
              Fee Juice has been deposited on L1 and needs to be claimed on L2.
              Use <code className="rounded bg-white/6 px-1">FeeJuicePaymentMethodWithClaim</code> from
              the Aztec SDK to claim it when deploying your account, or use your
              Aztec wallet to claim. Save the data below — you&apos;ll need it.
            </p>
          </div>

          <DataField label="Claim Amount" value={result.claimData.claimAmount} />
          <DataField
            label="Claim Secret"
            value={result.claimData.claimSecretHex}
          />
          <DataField
            label="Claim Secret Hash"
            value={result.claimData.claimSecretHashHex}
          />
          <DataField
            label="Message Hash"
            value={result.claimData.messageHashHex}
          />
          <DataField
            label="Message Leaf Index"
            value={result.claimData.messageLeafIndex}
          />

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-chartreuse/70 transition-colors hover:text-chartreuse">
              How to claim via SDK
            </summary>
            <div className="mt-2 rounded-lg bg-white/4 p-3">
              <code className="block whitespace-pre-wrap text-xs text-zinc-300">
                {`import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

const claim = {
  claimAmount: ${result.claimData.claimAmount}n,
  claimSecret: Fr.fromHexString("${result.claimData.claimSecretHex}"),
  messageLeafIndex: ${result.claimData.messageLeafIndex}n,
};

// Use when deploying your account:
const paymentMethod = new FeeJuicePaymentMethodWithClaim(
  accountAddress, claim
);
await deployMethod.send({ fee: { paymentMethod } });`}
              </code>
              <div className="mt-2 flex justify-end">
                <CopyButton
                  text={`const claim = { claimAmount: ${result.claimData.claimAmount}n, claimSecret: Fr.fromHexString("${result.claimData.claimSecretHex}"), messageLeafIndex: ${result.claimData.messageLeafIndex}n };`}
                />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export type { DripResultData };
