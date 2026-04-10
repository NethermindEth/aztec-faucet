"use client";

import { useState, useCallback } from "react";
import { TurnstileWidget } from "./turnstile-widget";
import { CopyButton } from "./drip-result";
import type { DripResultData } from "./drip-result";
import { NODE_URL, NPM_TAG } from "@/lib/network-config";

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
}[] = [
  {
    value: "eth",
    label: "ETH",
    description: "L1 Ethereum for gas fees",
    addressType: "ethereum",
  },
  {
    value: "fee-juice",
    label: "Fee Juice",
    description: "L2 gas token (bridged from L1)",
    addressType: "aztec",
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
}: {
  onSuccess: (data: DripResultData) => void;
  onClaim: (claimId: string, initialClaimData?: InitialClaimData) => void;
  onPending: (asset: string) => void;
  onError: () => void;
  locked?: boolean;
  onGoToAccount?: () => void;
}) {
  const [address, setAddress] = useState("");
  const [asset, setAsset] = useState<Asset>("fee-juice");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [openAccordion, setOpenAccordion] = useState<"address" | "timing" | null>(null);
  const toggleAccordion = (name: "address" | "timing") =>
    setOpenAccordion((prev) => (prev === name ? null : name));

  const currentAsset = ASSETS.find((a) => a.value === asset)!;
  const isEthAddress = currentAsset.addressType === "ethereum";

  const onCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

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

    const hasTurnstile = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (hasTurnstile && !captchaToken) {
      setError("Please complete the CAPTCHA");
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
          captchaToken: captchaToken ?? "",
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Request failed");
        // retryAfter from server, or default to 24h for any rate-limit response
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Asset selector */}
      <div>
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Select Token
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ASSETS.map((a) => (
            <button
              key={a.value}
              type="button"
              disabled={locked}
              onClick={() => {
                if (locked) return;
                setAsset(a.value);
                setError(null);
              }}
              className={`rounded-xl border p-3 text-left transition-all ${
                locked
                  ? asset === a.value
                    ? a.value === "eth"
                      ? "cursor-not-allowed border-blue-400/20 bg-blue-400/4 text-zinc-400"
                      : "cursor-not-allowed border-chartreuse/20 bg-chartreuse/4 text-zinc-400"
                    : "cursor-not-allowed border-white/4 bg-white/1 text-zinc-600"
                  : asset === a.value
                  ? a.value === "eth"
                    ? "border-blue-400/40 bg-blue-400/8 text-white"
                    : "border-chartreuse/30 bg-chartreuse/6 text-white"
                  : "border-white/6 bg-white/2 text-zinc-500 hover:border-white/10 hover:text-zinc-300"
              }`}
            >
              <span className="block text-sm font-medium">{a.label}</span>
              <span className="mt-0.5 block text-xs opacity-60">
                {a.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fee Juice helper dropdowns */}
      {asset === "fee-juice" && (
        <div className="space-y-2">
          {/* Don't have an Aztec address accordion */}
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleAccordion("address")}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300">
                Don&apos;t have an Aztec address yet?
              </span>
              <span className={`shrink-0 text-zinc-600 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${openAccordion === "address" ? "rotate-45" : ""}`}>
                <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ gridTemplateRows: openAccordion === "address" ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-2">
                  <p className="text-xs text-zinc-500">
                    Prints your secret key and address. Nothing leaves your machine.
                    {onGoToAccount && (
                      <>
                        {" "}Or{" "}
                        <button
                          type="button"
                          onClick={onGoToAccount}
                          className="text-chartreuse/70 transition-colors hover:text-chartreuse underline underline-offset-2"
                        >
                          generate a throwaway account in the Account tab
                        </button>
                        {" "}with no CLI needed.
                      </>
                    )}
                  </p>
                  <div className="rounded-lg border border-white/5 bg-black/30">
                    <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">quick start, curl, no clone</span>
                      <CopyButton text={makeCreateAccountOneLiner()} />
                    </div>
                    <pre className="overflow-x-auto px-3 py-3 text-[11px] leading-relaxed text-zinc-400">
                      <code>{makeCreateAccountOneLiner()}</code>
                    </pre>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/30">
                    <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">self-contained, no clone needed</span>
                      <CopyButton text={makeCreateAccountSelfContained()} />
                    </div>
                    <pre className="overflow-x-auto px-3 py-3 text-[11px] leading-relaxed text-zinc-400">
                      <code>{makeCreateAccountSelfContained()}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Why Fee Juice takes 1-2 minutes accordion */}
          <div className="rounded-xl border border-chartreuse/10 bg-chartreuse/4 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleAccordion("timing")}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs font-medium text-chartreuse/80 transition-colors hover:text-chartreuse">
                Why does Fee Juice take 1-2 minutes?
              </span>
              <span className={`shrink-0 text-chartreuse/60 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${openAccordion === "timing" ? "rotate-45" : ""}`}>
                <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ gridTemplateRows: openAccordion === "timing" ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="border-t border-chartreuse/10 px-4 pb-4 pt-3">
                  <p className="text-xs text-chartreuse/50">
                    Fee Juice must be <strong className="text-chartreuse/70">bridged from L1 to L2</strong>. The faucet sends an L1 transaction to the Fee Juice Portal contract, then the Aztec sequencer picks up that message and includes it in an L2 block. That relay step takes 1-2 minutes. Once ready, you&apos;ll get claim data to use when deploying your account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address input */}
      <div>
        <label
          htmlFor="address"
          className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500"
        >
          Recipient Address
        </label>
        <div className="relative">
          <input
            id="address"
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
            className={`w-full rounded-xl border py-3 pl-4 pr-20 font-mono text-sm placeholder-zinc-600 outline-none transition-all ${
              locked
                ? "cursor-not-allowed border-white/4 bg-white/2 text-zinc-500 select-none"
                : "border-white/6 bg-white/3 text-white focus:border-chartreuse/40 focus:ring-1 focus:ring-chartreuse/20"
            }`}
          />
          {!locked && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setAddress(text.trim());
                  if (error) setError(null);
                } catch {
                  // clipboard permission denied — silently ignore
                }
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-[11px] text-zinc-500 transition-all hover:border-chartreuse/30 hover:text-chartreuse"
              title="Paste from clipboard"
            >
              <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3">
                <rect x="4" y="1" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2 4H1.5A1.5 1.5 0 000 5.5v7A1.5 1.5 0 001.5 14H8a1.5 1.5 0 001.5-1.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Paste
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">
          {isEthAddress
            ? "Ethereum address (0x + 40 hex chars)"
            : "Aztec address (0x + 64 hex chars)"}
        </p>
      </div>

      {/* Turnstile CAPTCHA */}
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
        <div className="flex justify-center">
          <TurnstileWidget onToken={onCaptchaToken} />
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || locked}
        className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
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
              ? "Bridging Fee Juice..."
              : "Sending ETH..."}
          </span>
        ) : (
          `Request ${currentAsset.label}`
        )}
      </button>

      {/* Inline error display */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/6 p-4">
          <p className="text-sm font-medium text-red-400">{error}</p>
          {retryAfter && (
            <p className="mt-1 text-xs text-red-400/70">
              Try again in {formatRetryAfter(retryAfter)}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
