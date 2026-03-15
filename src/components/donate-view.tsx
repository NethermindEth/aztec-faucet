"use client";

import { useEffect, useState } from "react";

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

function Sk({ w = "w-24" }: { w?: string }) {
  return <span className={`skeleton inline-block ${w} h-3 rounded`} />;
}

export function DonateView({ network }: { network: "devnet" | "testnet" }) {
  const [faucetAddress, setFaucetAddress] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/status?network=${network}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.faucetAddress) setFaucetAddress(data.faucetAddress);
      })
      .catch(() => {});
  }, [network]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 animate-panel-state-in">
      {/* Heart / support icon */}
      <div className="flex justify-center pt-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-chartreuse/20 bg-chartreuse/8">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-chartreuse">
            <path
              d="M12 21C12 21 3 14.5 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.79 3.9 12 5C12.21 3.9 13.76 3 15.5 3C18.54 3 21 5.46 21 8.5C21 14.5 12 21 12 21Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="currentColor"
              fillOpacity="0.15"
            />
          </svg>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-base font-semibold text-white mb-1">Support the Faucet</h2>
        <p className="text-xs text-zinc-500 mb-6">
          This faucet runs on Sepolia ETH to bridge Fee Juice for every request.
          If you find it useful, consider sending a small amount of Sepolia ETH to the address below to help keep it running.
          Make sure you are sending on the <span className="text-zinc-300 font-medium">Sepolia testnet</span>.
        </p>

        <div className="rounded-xl border border-chartreuse/10 bg-chartreuse/4 px-4 mb-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-chartreuse/60">
              Faucet Address
            </span>
            <span className="flex items-center justify-end gap-2 text-xs text-zinc-300">
              {faucetAddress ? (
                <>
                  <span className="font-mono text-[11px] whitespace-nowrap">
                    {faucetAddress.slice(0, 8)}…{faucetAddress.slice(-6)}
                  </span>
                  <CopyInline text={faucetAddress} />
                </>
              ) : (
                <Sk w="w-36" />
              )}
            </span>
          </div>
        </div>

        {faucetAddress && (
          <div className="flex justify-center">
            <a
              href={`https://sepolia.etherscan.io/address/${faucetAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-chartreuse"
            >
              <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3 shrink-0">
                <path
                  d="M6 2H2.5A.5.5 0 002 2.5v9a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V8M8.5 2H12v3.5M12 2L6.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              View on Sepolia Etherscan
            </a>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-zinc-600">
        Thank you for supporting open developer tooling on Aztec.
      </div>
    </div>
  );
}
