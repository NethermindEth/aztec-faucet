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
      className="ml-1.5 border border-outline-variant px-2 py-0.5 font-label text-[10px] uppercase tracking-wider text-on-surface-variant transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Sk({ w = "w-24" }: { w?: string }) {
  return <span className={`skeleton inline-block ${w} h-3`} />;
}

export function DonateView() {
  const [faucetAddress, setFaucetAddress] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.faucetAddress) setFaucetAddress(data.faucetAddress);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 animate-panel-state-in">
      {/* Heart icon */}
      <div className="flex justify-center pt-2">
        <div className="flex h-14 w-14 items-center justify-center border-2 border-accent/20 bg-accent/8">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-accent">
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

      <div className="bg-surface-container p-5 sm:p-8 shadow-2xl">
        <h2 className="font-headline text-2xl uppercase tracking-tight text-on-surface mb-1">Support the Faucet</h2>
        <p className="font-body text-xs text-on-surface-variant opacity-70 mb-6">
          This faucet runs on Sepolia ETH to bridge Fee Juice for every request.
          If you find it useful, consider sending a small amount of Sepolia ETH to the address below to help keep it running.
          Make sure you are sending on the <span className="text-on-surface font-medium">Sepolia testnet</span>.
        </p>

        <div className="bg-accent/5 border-l-4 border-accent px-5 mb-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="shrink-0 font-label text-[10px] font-bold uppercase tracking-widest text-accent/60">
              Faucet Address
            </span>
            <span className="flex items-center justify-end gap-2 font-label text-xs text-on-surface">
              {faucetAddress ? (
                <>
                  <span className="font-label text-[11px] whitespace-nowrap">
                    {faucetAddress.slice(0, 8)}...{faucetAddress.slice(-6)}
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
              className="flex items-center gap-1.5 font-label text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent"
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

      <div className="text-center font-label text-[10px] text-on-surface-variant opacity-40 uppercase tracking-widest">
        Thank you for supporting open developer tooling on Aztec.
      </div>
    </div>
  );
}
