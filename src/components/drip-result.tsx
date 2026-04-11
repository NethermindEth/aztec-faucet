"use client";

import { useState, useCallback } from "react";
import { ConfettiBurst } from "./confetti-burst";
import { NODE_URL, NPM_TAG, EXPLORER_TX_URL } from "@/lib/network-config";

const GITHUB_REPO = "https://github.com/NethermindEth/aztec-faucet";
const GITHUB_RAW = `https://raw.githubusercontent.com/NethermindEth/aztec-faucet/${process.env.NEXT_PUBLIC_GITHUB_BRANCH ?? "main"}`;

export function makeClaimOneLiner(claimAmount: string, claimSecretHex: string, messageLeafIndex: string): string {
  return `curl -fsSL ${GITHUB_RAW}/sh/testnet/claim.sh | sh -s -- \\
  --secret <YOUR_SECRET_KEY> \\
  --claim-amount ${claimAmount} \\
  --claim-secret ${claimSecretHex} \\
  --message-leaf-index ${messageLeafIndex}`;
}

export function makeClaimSelfContained(claimAmount: string, claimSecretHex: string, messageLeafIndex: string): string {
  return `mkdir -p ~/.aztec-devtools && cd ~/.aztec-devtools && \\
echo '{"type":"module"}' > package.json && \\
npm install --no-package-lock @aztec/wallets@${NPM_TAG} @aztec/aztec.js@${NPM_TAG} @aztec/stdlib@${NPM_TAG} --silent && \\
LOG_LEVEL=silent node --input-type=module << 'AZTEC_EOF'
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { GasSettings } from "@aztec/stdlib/gas";
const { EmbeddedWallet } = await import("@aztec/wallets/embedded");

const SECRET = "YOUR_SECRET_KEY";           // ← paste your secret key here
const AMOUNT = ${claimAmount}n;
const CLAIM_SECRET = Fr.fromHexString("${claimSecretHex}");
const LEAF = ${messageLeafIndex}n;
const NODE_URL = "${NODE_URL}";

const wallet = await EmbeddedWallet.create(NODE_URL, { ephemeral: true, pxeConfig: { proverEnabled: true } });
const mgr = await wallet.createSchnorrAccount(Fr.fromHexString(SECRET), Fr.ZERO);
const addr = mgr.address;
const isDeployed = (await wallet.getContractMetadata(addr)).isContractInitialized;
const node = createAztecNodeClient(NODE_URL);
const gasSettings = GasSettings.default({ maxFeesPerGas: (await node.getCurrentMinFees()).mul(2) });
const claim = { claimAmount: AMOUNT, claimSecret: CLAIM_SECRET, messageLeafIndex: LEAF };
if (!isDeployed) {
  console.log("Deploying account + claiming Fee Juice (proving ~10s)...");
  const raw = await (await mgr.getDeployMethod()).send({
    from: AztecAddress.ZERO,
    fee: { gasSettings, paymentMethod: new FeeJuicePaymentMethodWithClaim(addr, claim) },
    wait: { returnReceipt: true },
  });
  const receipt = raw?.receipt ?? raw;
  const txHash = receipt?.txHash?.toString?.();
  console.log("Done! Tx:", txHash, "| Block:", receipt?.blockNumber);
  if (txHash) console.log("View on explorer: ${EXPLORER_TX_URL}/" + txHash);
} else {
  const { FeeJuiceContract } = await import("@aztec/aztec.js/protocol");
  console.log("Claiming into existing account (proving ~10s)...");
  const raw = await FeeJuiceContract.at(wallet).methods
    .claim(addr, AMOUNT, CLAIM_SECRET, new Fr(LEAF))
    .send({ from: addr, fee: { gasSettings } });
  const receipt = raw?.receipt ?? raw;
  const txHash = receipt?.txHash?.toString?.();
  console.log("Done! Tx:", txHash, "| Block:", receipt?.blockNumber);
  if (txHash) console.log("View on explorer: ${EXPLORER_TX_URL}/" + txHash);
}
await wallet.stop();
process.exit(0);
AZTEC_EOF`;
}

export function SelfContainedDropdown({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-outline-variant/40 bg-surface-lowest">
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors hover:bg-surface-low" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">self-contained</span>
          <span className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "rotate-45" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-on-surface-variant opacity-50">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <CopyButton text={code} />
        </div>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <pre className="max-h-48 overflow-x-auto overflow-y-auto border-t border-outline-variant/30 px-4 py-3 text-[11px] leading-relaxed text-on-surface-variant font-label">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

export function ClaimCommands({ claimAmount, claimSecretHex, messageLeafIndex }: {
  claimAmount: string;
  claimSecretHex: string;
  messageLeafIndex: string;
}) {
  const oneLiner = makeClaimOneLiner(claimAmount, claimSecretHex, messageLeafIndex);
  const selfContained = makeClaimSelfContained(claimAmount, claimSecretHex, messageLeafIndex);
  return (
    <div className="space-y-2">
      <div className="border border-outline-variant/40 bg-surface-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">curl one-liner</span>
            <span className="bg-emerald-500/15 px-2 py-0.5 font-label text-[9px] font-bold uppercase tracking-widest text-emerald-400">Recommended</span>
          </div>
          <CopyButton text={oneLiner} />
        </div>
        <pre className="overflow-x-auto px-4 py-1.5 text-[11px] leading-relaxed text-on-surface-variant font-label">
          <code>{oneLiner}</code>
        </pre>
      </div>
      <SelfContainedDropdown code={selfContained} />
      <div className="flex items-start gap-2 border border-secondary/25 bg-secondary/8 px-3 py-2">
        <svg viewBox="0 0 16 16" fill="none" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary">
          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v3.5M8 10.5h.007" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="font-label text-[11px] leading-relaxed text-secondary">
          Replace <code className="bg-secondary/15 px-1 font-bold text-secondary">&lt;YOUR_SECRET_KEY&gt;</code> with your account secret. All other values are pre-filled.
        </p>
      </div>
    </div>
  );
}

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
      className="shrink-0 border border-outline-variant px-2 py-1 font-label text-xs uppercase tracking-wider text-on-surface-variant transition-all hover:border-accent hover:text-accent"
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
      <div className="mb-1 flex items-center justify-between">
        <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">{label}</p>
        <CopyButton text={value} />
      </div>
      <code className="block break-all bg-surface-lowest px-3 py-1.5 font-label text-xs leading-relaxed text-on-surface">
        {value}
      </code>
    </div>
  );
}

const ASSET_LABELS: Record<string, string> = {
  eth: "L1 ETH",
  "fee-juice": "Fee Juice",
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
      className="btn-primary w-full py-2.5 text-sm uppercase"
    >
      Request another drip
    </button>
  );
}

function EthResult({ txHash, onReset }: { txHash: string; onReset?: () => void }) {
  const [showFullHash, setShowFullHash] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <ConfettiBurst />
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center border border-accent/30 bg-accent/10">
              <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-accent">
                <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-label text-sm font-bold uppercase tracking-wider text-on-surface">ETH Sent</span>
          </div>
          <span className="border border-accent/30 bg-accent/10 px-2.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-widest text-accent">
            Confirmed
          </span>
        </div>

        {/* Network row */}
        <div className="flex items-center gap-2 border border-outline-variant/30 bg-surface-low px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping bg-accent/60" style={{ animationDuration: "2.5s" }} />
            <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
          </span>
          <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant opacity-60">Sepolia Testnet</span>
          <span className="ml-auto font-label text-xs text-on-surface-variant opacity-40">11155111</span>
        </div>

        {/* Transaction hash */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
              Transaction Hash
            </p>
            <CopyButton text={txHash} />
          </div>
          <div className="bg-surface-low px-3 py-2.5">
            <code className="block font-label text-sm text-on-surface">
              {truncateHash(txHash)}
            </code>
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowFullHash((v) => !v)}
                className="flex items-center gap-1.5 font-label text-[10px] text-on-surface-variant opacity-50 transition-colors hover:opacity-80"
              >
                <span className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${showFullHash ? "rotate-45" : ""}`}>
                  <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                Show full hash
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ gridTemplateRows: showFullHash ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <code className="mt-1.5 block break-all font-label text-[11px] leading-relaxed text-on-surface-variant opacity-60">
                    {txHash}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Etherscan link */}
        <a
          href={`${SEPOLIA_ETHERSCAN}/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between border border-outline-variant bg-surface-low px-4 py-3 font-label text-sm uppercase tracking-wider transition-all hover:border-accent hover:bg-accent/5"
        >
          <span className="text-on-surface-variant transition-colors group-hover:text-on-surface">
            View on Sepolia Etherscan
          </span>
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-on-surface-variant opacity-50 transition-all group-hover:translate-x-0.5 group-hover:text-accent">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {onReset && <ResetButton onReset={onReset} />}
    </div>
  );
}


export function DripResult({ result, error, retryAfter, onReset }: DripResultProps) {
  if (error) {
    return (
      <div className="border-l-4 border-red-500 bg-red-500/10 p-4">
        <p className="font-label text-sm text-red-400">{error}</p>
        {retryAfter && (
          <p className="mt-1 font-label text-xs text-red-400/70">
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

  // fee-juice fallback
  const assetLabel = ASSET_LABELS[result.asset] ?? result.asset;

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-accent/30 bg-accent/10">
            <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-accent">
              <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-label text-sm font-bold uppercase tracking-wider text-on-surface">{assetLabel} Sent</span>
        </div>

        {result.txHash && <DataField label="Transaction Hash" value={result.txHash} />}

        {result.claimData && (
          <div className="space-y-3">
            <div className="border border-secondary/20 bg-secondary/5 px-4 py-3">
              <p className="font-label text-xs font-bold uppercase tracking-wider text-secondary">Action required: Claim on L2</p>
              <p className="mt-1 font-body text-xs text-secondary/60">
                Bridge is complete. Use the script or SDK to claim.
              </p>
            </div>

            <DataField label="Claim Amount" value={result.claimData.claimAmount} />
            <DataField label="Claim Secret" value={result.claimData.claimSecretHex} />
            <DataField label="Claim Secret Hash" value={result.claimData.claimSecretHashHex} />
            <DataField label="Message Hash" value={result.claimData.messageHashHex} />
            <DataField label="Message Leaf Index" value={result.claimData.messageLeafIndex} />

            <ClaimCommands
              claimAmount={result.claimData.claimAmount}
              claimSecretHex={result.claimData.claimSecretHex}
              messageLeafIndex={result.claimData.messageLeafIndex}
            />
          </div>
        )}
      </div>

      {onReset && <ResetButton onReset={onReset} />}
    </div>
  );
}

export type { DripResultData };
