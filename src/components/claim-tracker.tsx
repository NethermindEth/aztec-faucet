"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CopyButton, DataField } from "./drip-result";

type ClaimStatus = "bridging" | "ready" | "expired";

type ClaimData = {
  claimAmount: string;
  claimSecretHex: string;
  claimSecretHashHex: string;
  messageHashHex: string;
  messageLeafIndex: string;
};

type ClaimResponse = {
  status: ClaimStatus;
  elapsedSeconds: number;
  expiresInSeconds?: number;
  claimData?: ClaimData;
  sdkSnippet?: string;
};

const POLL_INTERVAL_MS = 3_000;

export function ClaimTracker({
  claimId,
  onReset,
}: {
  claimId: string;
  onReset: () => void;
}) {
  const [status, setStatus] = useState<ClaimStatus>("bridging");
  const [elapsed, setElapsed] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [sdkSnippet, setSdkSnippet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const expiryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/claim/${claimId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Claim not found. It may have expired.");
          setStatus("expired");
        }
        return;
      }

      const data: ClaimResponse = await res.json();
      setStatus(data.status);
      setElapsed(data.elapsedSeconds);

      if (data.status === "ready" && data.claimData) {
        setClaimData(data.claimData);
        setSdkSnippet(data.sdkSnippet ?? null);
        if (data.expiresInSeconds !== undefined) {
          setExpiresIn(data.expiresInSeconds);
        }
      }
    } catch {
      // Silently retry on network errors
    }
  }, [claimId]);

  // Poll the backend
  useEffect(() => {
    if (status !== "bridging") return;

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, poll]);

  // Countdown timer once claim is ready
  useEffect(() => {
    if (status !== "ready" || expiresIn === null) return;

    expiryTimerRef.current = setInterval(() => {
      setExpiresIn((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, [status, expiresIn === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local elapsed timer for smooth display
  useEffect(() => {
    if (status !== "bridging") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/6 p-4">
        <p className="text-sm font-medium text-red-400">{error}</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 rounded-lg border border-white/8 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/4 hover:text-white"
        >
          Request again
        </button>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="mt-6 rounded-xl border border-orchid/20 bg-orchid/4 p-4">
        <p className="text-sm font-medium text-orchid">
          This claim has expired.
        </p>
        <p className="mt-1 text-xs text-orchid/60">
          The L1→L2 message took too long to be included. Please request Fee
          Juice again.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 rounded-lg border border-white/8 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/4 hover:text-white"
        >
          Request again
        </button>
      </div>
    );
  }

  if (status === "bridging") {
    return (
      <div className="mt-6 rounded-xl border border-chartreuse/15 bg-chartreuse/4 p-4">
        <div className="flex items-center gap-3">
          <div className="relative h-5 w-5">
            <div className="absolute inset-0 animate-ping rounded-full bg-chartreuse/20" />
            <div className="relative h-5 w-5 rounded-full border-2 border-chartreuse/50 bg-chartreuse/10" />
          </div>
          <div>
            <p className="text-sm font-medium text-chartreuse">
              Bridging Fee Juice from L1 to L2...
            </p>
            <p className="mt-0.5 text-xs text-chartreuse/50">
              Waiting for the L1→L2 message to be picked up by the Aztec
              sequencer. This usually takes 1-2 minutes.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
          <span className="text-xs text-zinc-500">Elapsed</span>
          <span className="font-mono text-sm text-zinc-300">
            {formatElapsed(elapsed)}
          </span>
        </div>

        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full animate-pulse rounded-full bg-chartreuse/40 transition-all duration-1000"
              style={{ width: `${Math.min((elapsed / 120) * 100, 95)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // status === "ready"
  const expiryUrgent = expiresIn !== null && expiresIn < 300;
  const expiryCritical = expiresIn !== null && expiresIn < 60;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-aqua/20 bg-aqua/4 p-4">
        <p className="text-sm font-medium text-aqua">
          Fee Juice is ready to claim!
        </p>
        <p className="mt-1 text-xs text-aqua/60">
          The L1→L2 bridge message has been included on L2. Use the data below
          to claim your Fee Juice. See the SDK snippet for both new account
          deployment and existing account usage.
        </p>
      </div>

      {expiresIn !== null && (
        <div
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
            expiryCritical
              ? "border border-red-500/20 bg-red-500/6 text-red-400"
              : expiryUrgent
                ? "border border-orchid/20 bg-orchid/6 text-orchid"
                : "border border-white/6 bg-white/4 text-zinc-400"
          }`}
        >
          <span>Claim data expires in</span>
          <span className="font-mono font-medium">
            {formatElapsed(expiresIn)}
          </span>
        </div>
      )}

      {claimData && (
        <div className="space-y-3 rounded-xl border border-white/6 bg-white/2 p-4">
          <DataField label="Claim Amount" value={claimData.claimAmount} />
          <DataField label="Claim Secret" value={claimData.claimSecretHex} />
          <DataField
            label="Claim Secret Hash"
            value={claimData.claimSecretHashHex}
          />
          <DataField label="Message Hash" value={claimData.messageHashHex} />
          <DataField
            label="Message Leaf Index"
            value={claimData.messageLeafIndex}
          />
        </div>
      )}

      {claimData && (
        <details open>
          <summary className="cursor-pointer text-xs text-chartreuse/70 transition-colors hover:text-chartreuse">
            CLI command
          </summary>
          <div className="mt-2 rounded-lg border border-white/6 bg-white/4 p-3">
            <div className="overflow-x-auto">
              <pre className="text-xs text-zinc-300">{`node scripts/claim-fee-juice.mjs \\
  --secret <your-account-secret> \\
  --claim-amount ${claimData.claimAmount} \\
  --claim-secret ${claimData.claimSecretHex} \\
  --message-leaf-index ${claimData.messageLeafIndex}`}</pre>
            </div>
            <div className="mt-2 flex justify-end">
              <CopyButton
                text={`node scripts/claim-fee-juice.mjs \\\n  --secret <your-account-secret> \\\n  --claim-amount ${claimData.claimAmount} \\\n  --claim-secret ${claimData.claimSecretHex} \\\n  --message-leaf-index ${claimData.messageLeafIndex}`}
              />
            </div>
          </div>
        </details>
      )}

      {sdkSnippet && (
        <details>
          <summary className="cursor-pointer text-xs text-chartreuse/70 transition-colors hover:text-chartreuse">
            SDK code snippet
          </summary>
          <div className="mt-2 rounded-lg border border-white/6 bg-white/4 p-3">
            <div className="overflow-x-auto">
              <pre className="text-xs text-zinc-300">{sdkSnippet}</pre>
            </div>
            <div className="mt-2 flex justify-end">
              <CopyButton text={sdkSnippet} />
            </div>
          </div>
        </details>
      )}

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-xl border border-white/8 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/4 hover:text-white"
      >
        Request another drip
      </button>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
