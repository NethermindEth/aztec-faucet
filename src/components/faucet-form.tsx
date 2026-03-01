"use client";

import { useState, useCallback } from "react";
import { TurnstileWidget } from "./turnstile-widget";
import { DripResult, type DripResultData } from "./drip-result";
import { ClaimTracker } from "./claim-tracker";

type Asset = "eth" | "fee-juice" | "test-token";

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
  {
    value: "test-token",
    label: "Test Token",
    description: "L2 test ERC20 token",
    addressType: "aztec",
  },
];

function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidAztecAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}

export function FaucetForm() {
  const [address, setAddress] = useState("");
  const [asset, setAsset] = useState<Asset>("eth");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DripResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);

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
        return "Invalid Ethereum address — expected 0x followed by 40 hex characters";
      }
    } else {
      if (!isValidAztecAddress(trimmed)) {
        if (isValidEthAddress(trimmed)) {
          return `This looks like an Ethereum address. ${currentAsset.label} requires an Aztec address (0x + 64 hex chars)`;
        }
        return "Invalid Aztec address — expected 0x followed by 64 hex characters";
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
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
        if (data.retryAfter) setRetryAfter(data.retryAfter);
        return;
      }

      if (data.claimId) {
        setClaimId(data.claimId);
      } else {
        setResult(data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. The server may be busy — please try again.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const placeholder = isEthAddress
    ? "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80"
    : "0x09a4df73aa47f82531a038d1d51abfc85b27665c4b7ca751e2d4fa9f19caffb2";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Asset selector */}
      <div>
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Select Token
        </label>
        <div className="grid grid-cols-3 gap-2">
          {ASSETS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => {
                setAsset(a.value);
                setResult(null);
                setError(null);
              }}
              className={`rounded-xl border p-3 text-left transition-all ${
                asset === a.value
                  ? "border-chartreuse/30 bg-chartreuse/6 text-white"
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

      {/* Fee Juice bridging explanation */}
      {asset === "fee-juice" && (
        <div className="rounded-xl border border-chartreuse/10 bg-chartreuse/4 px-4 py-3">
          <p className="text-xs font-medium text-chartreuse/80">
            Why does Fee Juice take 1-2 minutes?
          </p>
          <p className="mt-1 text-xs text-chartreuse/40">
            Fee Juice is Aztec&apos;s L2 gas token. Unlike ETH (sent on L1) or
            test tokens (minted on L2), Fee Juice must be{" "}
            <strong className="text-chartreuse/60">bridged from L1 to L2</strong>{" "}
            through the Fee Juice Portal contract. The Aztec sequencer needs to
            pick up the L1→L2 message and include it in a block before the
            funds are available to claim.
          </p>
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
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-xl border border-white/6 bg-white/3 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-chartreuse/40 focus:ring-1 focus:ring-chartreuse/20"
        />
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
        disabled={loading}
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
              : asset === "test-token"
                ? "Minting tokens..."
                : "Sending ETH..."}
          </span>
        ) : (
          `Request ${currentAsset.label}`
        )}
      </button>

      {/* Result display */}
      {claimId ? (
        <ClaimTracker
          claimId={claimId}
          onReset={() => {
            setClaimId(null);
            setResult(null);
            setError(null);
          }}
        />
      ) : (
        <DripResult result={result} error={error} retryAfter={retryAfter} />
      )}
    </form>
  );
}
