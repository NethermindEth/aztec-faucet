"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { CopyButton } from "./drip-result";
import type { DripResultData } from "./drip-result";
import { NODE_URL, NPM_TAG } from "@/lib/network-config";

const ConnectWalletInline = dynamic(
  () => import("./connect-wallet-inline").then((m) => m.ConnectWalletInline),
  { ssr: false },
);

const GITHUB_RAW = `https://raw.githubusercontent.com/NethermindEth/aztec-faucet/${process.env.NEXT_PUBLIC_GITHUB_BRANCH ?? "main"}`;

function makeCreateAccountOneLiner(): string {
  return `curl -fsSL ${GITHUB_RAW}/sh/testnet/create-account.sh | sh`;
}

function makeCreateAccountSelfContained(): string {
  return `mkdir -p ~/.aztec-devtools && cd ~/.aztec-devtools && \\
echo '{"type":"module"}' > package.json && \\
npm install --no-package-lock @aztec/wallets@${NPM_TAG} @aztec/aztec.js@${NPM_TAG} --silent && \\
LOG_LEVEL=silent node --input-type=module << 'AZTEC_EOF'
import { Fr } from "@aztec/aztec.js/fields";
const { EmbeddedWallet } = await import("@aztec/wallets/embedded");
const wallet = await EmbeddedWallet.create("${NODE_URL}", { ephemeral: true });
const secret = Fr.random();
const account = await wallet.createSchnorrAccount(secret, Fr.ZERO);
console.log("\\nSecret Key: " + secret.toString());
console.log("Address:    " + account.address.toString() + "\\n");
await wallet.stop();
AZTEC_EOF`;
}

type Asset = "eth" | "fee-juice";

const ASSETS: {
  value: Asset;
  label: string;
  description: string;
  addressType: "ethereum" | "aztec";
  tag: string;
}[] = [
  {
    value: "fee-juice",
    label: "FEE JUICE",
    description: "L2 gas token",
    addressType: "aztec",
    tag: "TESTNET",
  },
  {
    value: "eth",
    label: "ETH",
    description: "L1 Ethereum",
    addressType: "ethereum",
    tag: "WRAP",
  },
];

function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidAztecAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}

type InitialClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
  l1TxHash?: string;
};

function formatRetryAfter(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function FaucetForm({
  onSuccess,
  onClaim,
  onPending,
  onError,
  locked = false,
  onGoToAccount,
  onAssetChange,
}: {
  onSuccess: (data: DripResultData) => void;
  onClaim: (claimId: string, initialClaimData?: InitialClaimData) => void;
  onPending: (asset: string) => void;
  onError: () => void;
  locked?: boolean;
  onGoToAccount?: () => void;
  onAssetChange?: (asset: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [asset, setAsset] = useState<Asset>("fee-juice");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [openAccordion, setOpenAccordion] = useState<"address" | "timing" | null>(null);
  const toggleAccordion = (name: "address" | "timing") =>
    setOpenAccordion((prev) => (prev === name ? null : name));

  const currentAsset = ASSETS.find((a) => a.value === asset)!;
  const isEthAddress = currentAsset.addressType === "ethereum";

  const validateLocally = (): string | null => {
    const trimmed = address.trim();
    if (!trimmed) return "Please enter an address";

    if (!trimmed.startsWith("0x")) {
      return "Address must start with 0x";
    }

    if (isEthAddress) {
      if (!isValidEthAddress(trimmed)) {
        return "Invalid Ethereum address: expected 0x followed by 40 hex characters";
      }
    } else {
      if (!isValidAztecAddress(trimmed)) {
        if (isValidEthAddress(trimmed)) {
          return `This looks like an Ethereum address. ${currentAsset.label} requires an Aztec address (0x + 64 hex chars)`;
        }
        return "Invalid Aztec address: expected 0x followed by 64 hex characters";
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRetryAfter(null);

    const validationError = validateLocally();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    onPending(asset);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch("/api/drip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          asset,
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Request failed");
        const retryMs = data.retryAfter || (res.status === 429 ? 86_400_000 : null);
        if (retryMs) setRetryAfter(retryMs);
        onError();
        return;
      }

      if (data.claimId) {
        onClaim(data.claimId, data.claimData);
      } else {
        onSuccess(data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. The server may be busy. Please try again.");
      } else {
        setError("Network error. Please try again.");
      }
      onError();
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const placeholder = isEthAddress
    ? "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80"
    : "0x09a4df73aa47f82531a038d1d51abfc85b27665c4b7ca751e2d4fa9f19caffb2";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Form Header */}
      <div className="flex justify-between items-end border-b border-outline-variant pb-3">
        <div>
          <h2 className="font-headline text-xl md:text-2xl text-on-surface uppercase tracking-tight">
            Claim Tokens
          </h2>
          <p className="font-label text-[10px] text-on-surface-variant mt-0.5">
            ESTIMATED ARRIVAL: <span className="text-accent">{asset === "eth" ? "~24 SECONDS" : "~1-2 MINUTES"}</span>
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-accent shrink-0">
          <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z" />
        </svg>
      </div>

      {/* Wallet Address Input */}
      <div className="flex flex-col gap-1.5">
        <label className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Wallet Address
        </label>
        <div className="focus-glow-line relative">
          <input
            type="text"
            value={address}
            onChange={(e) => {
              if (locked) return;
              setAddress(e.target.value);
              if (error) setError(null);
            }}
            readOnly={locked}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            className={`stitch-input text-sm py-3! pr-20! sm:pr-28! ${
              locked ? "cursor-not-allowed opacity-50" : ""
            }`}
          />
          {!locked && (
            <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {!isEthAddress && (
                <ConnectWalletInline
                  onAddress={(addr) => {
                    setAddress(addr);
                    if (error) setError(null);
                  }}
                />
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    setAddress(text.trim());
                    if (error) setError(null);
                  } catch {
                    // clipboard permission denied
                  }
                }}
                className="flex items-center gap-1.5 border border-outline-variant bg-surface-high px-2 sm:px-3 py-1.5 font-label text-[10px] sm:text-[11px] uppercase tracking-wider text-on-surface-variant transition-all hover:border-accent hover:text-accent"
                title="Paste from clipboard"
              >
                Paste
              </button>
            </div>
          )}
        </div>
        <p className="font-label text-[10px] text-on-surface-variant opacity-60 uppercase tracking-wider">
          {isEthAddress
            ? "Ethereum address (0x + 40 hex chars)"
            : "Aztec address (0x + 64 hex chars)"}
        </p>
      </div>

      {/* Asset Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Select Asset
        </label>
        <div className="grid grid-cols-2 gap-3">
          {ASSETS.map((a) => (
            <button
              key={a.value}
              type="button"
              disabled={locked}
              onClick={() => {
                if (locked) return;
                setAsset(a.value);
                setError(null);
                onAssetChange?.(a.value);
              }}
              className={`flex items-center justify-between p-3 transition-colors overflow-hidden ${
                locked
                  ? asset === a.value
                    ? "bg-surface-high border-2 border-accent/30 cursor-not-allowed"
                    : "bg-surface-low border-2 border-transparent cursor-not-allowed"
                  : asset === a.value
                    ? "bg-surface-high hover:bg-surface-highest border-2 border-accent"
                    : "bg-surface-low hover:bg-surface-high border-2 border-transparent"
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center shrink-0 ${
                  asset === a.value ? "bg-accent" : "bg-surface-highest"
                }`}>
                  {a.value === "fee-juice" ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 ${asset === a.value ? "text-surface" : "text-on-surface"}`}>
                      <path d="M11 15H6l7-14v8h5l-7 14v-8z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 ${asset === a.value ? "text-surface" : "text-on-surface"}`}>
                      <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z" />
                    </svg>
                  )}
                </div>
                <span className={`font-label text-sm sm:text-base uppercase font-bold truncate ${
                  asset === a.value ? "text-on-surface" : "text-on-surface opacity-50"
                }`}>{a.label}</span>
              </div>
              <span className="font-label text-[10px] sm:text-xs opacity-40 shrink-0">{a.tag}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || locked}
        className="btn-primary w-full py-3.5 text-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {asset === "fee-juice"
              ? "BRIDGING FEE JUICE..."
              : "SENDING ETH..."}
          </span>
        ) : (
          `REQUEST ${currentAsset.label}`
        )}
      </button>

      {/* Error display */}
      {error && (
        <div className="border-l-4 border-red-500 bg-red-500/10 p-4">
          <p className="text-sm font-label text-red-400">{error}</p>
          {retryAfter && (
            <p className="mt-1 font-label text-xs text-red-400/70">
              Try again in {formatRetryAfter(retryAfter)}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function FeeJuiceHelpers({ onGoToAccount }: { onGoToAccount?: () => void }) {
  const [openAccordion, setOpenAccordion] = useState<"address" | "timing" | null>(null);
  const toggleAccordion = (name: "address" | "timing") =>
    setOpenAccordion((prev) => (prev === name ? null : name));

  return (
    <div className="flex flex-col gap-2">
      {/* Don't have an Aztec address */}
      <div className="border border-outline-variant/40 bg-surface-low overflow-hidden">
        <button
          type="button"
          onClick={() => toggleAccordion("address")}
          className="flex w-full items-center justify-between px-4 py-2 text-left"
        >
          <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent">
            Don&apos;t have an Aztec address yet?
          </span>
          <span className={`shrink-0 text-on-surface-variant transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${openAccordion === "address" ? "rotate-45" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: openAccordion === "address" ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-outline-variant/40 px-4 pb-4 pt-3 space-y-2">
              <p className="text-[11px] text-on-surface-variant opacity-70">
                Prints your secret key and address. Nothing leaves your machine.
                {onGoToAccount && (
                  <>
                    {" "}Or{" "}
                    <button
                      type="button"
                      onClick={onGoToAccount}
                      className="text-accent/70 transition-colors hover:text-accent underline underline-offset-2"
                    >
                      generate in the Account tab
                    </button>
                    .
                  </>
                )}
              </p>
              <div className="border border-outline-variant/30 bg-surface-lowest">
                <div className="flex items-center justify-between border-b border-outline-variant/30 px-3 py-2">
                  <span className="font-label text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">curl one-liner</span>
                  <CopyButton text={makeCreateAccountOneLiner()} />
                </div>
                <pre className="overflow-x-auto px-3 py-2 text-[10px] leading-relaxed text-on-surface-variant font-label">
                  <code>{makeCreateAccountOneLiner()}</code>
                </pre>
              </div>
              <div className="border border-outline-variant/30 bg-surface-lowest">
                <div className="flex items-center justify-between border-b border-outline-variant/30 px-3 py-2">
                  <span className="font-label text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">self-contained</span>
                  <CopyButton text={makeCreateAccountSelfContained()} />
                </div>
                <pre className="overflow-x-auto px-3 py-2 text-[10px] leading-relaxed text-on-surface-variant font-label max-h-40 overflow-y-auto">
                  <code>{makeCreateAccountSelfContained()}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why Fee Juice takes time */}
      <div className="border border-accent/20 bg-accent/5 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleAccordion("timing")}
          className="flex w-full items-center justify-between px-4 py-2 text-left"
        >
          <span className="font-label text-[10px] uppercase tracking-wider text-accent/80 transition-colors hover:text-accent">
            Why does Fee Juice take 1-2 minutes?
          </span>
          <span className={`shrink-0 text-accent/60 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${openAccordion === "timing" ? "rotate-45" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: openAccordion === "timing" ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-accent/20 px-4 pb-3 pt-2">
              <p className="text-[11px] text-accent/50">
                Fee Juice must be <strong className="text-accent/70">bridged from L1 to L2</strong>. The faucet sends an L1 transaction to the Fee Juice Portal contract, then the Aztec sequencer picks up that message and includes it in an L2 block. That relay step takes 1-2 minutes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
