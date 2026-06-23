"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/use-mounted";
import type { ConnectPhase } from "@/lib/use-wallet-connect";

// Azguard's discovery icon URL doesn't resolve in dev — ship a local logo.
function ProviderIcon({ icon, name }: { icon?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const isAzguard = /azguard/i.test(name);
  const src = isAzguard ? "/azguard-logo.png" : icon;

  if (!src || broken) {
    const letter = name.trim().charAt(0).toUpperCase() || "W";
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-accent/20 font-label text-[11px] font-bold text-accent">
        {letter}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-6 w-6 shrink-0 rounded-sm"
      onError={() => setBroken(true)}
    />
  );
}

type Props = {
  phase: ConnectPhase;
  pickProvider: (p: import("@/lib/wallet-client").WalletProvider) => void;
  confirm: () => void;
  reject: () => void;
  reset: () => void;
  pickAccount: (address: string) => void;
  beginDiscovery: (choice: import("@/lib/wallet-client").WalletChoice) => void;
};

export function WalletConnectModal({ phase, pickProvider, confirm, reject, reset, pickAccount, beginDiscovery }: Props) {
  if (phase.kind === "idle" || phase.kind === "connected") return null;

  if (phase.kind === "choosing") {
    return (
      <Modal title="Connect your wallet" onClose={reset}>
        <ChooseSourceBody beginDiscovery={beginDiscovery} />
      </Modal>
    );
  }

  if (phase.kind === "discovering") {
    return (
      <Modal title="Choose a wallet" onClose={reset}>
        <DiscoveringBody providers={phase.providers} pickProvider={pickProvider} reset={reset} retry={() => beginDiscovery(phase.choice)} />
      </Modal>
    );
  }

  if (phase.kind === "picking-account") {
    return (
      <Modal title="Choose an account" onClose={reset}>
        <AccountPickerBody accounts={phase.accounts} pickAccount={pickAccount} reset={reset} />
      </Modal>
    );
  }

  if (phase.kind === "connecting") {
    return (
      <Modal title={`Connecting to ${phase.provider.name}`} onClose={reset}>
        <ConnectingBody />
      </Modal>
    );
  }

  if (phase.kind === "verifying") {
    return (
      <Modal title="Verify connection" onClose={reject}>
        <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-80">
          Your wallet is showing the same set of emojis right now. Match them
          to confirm the connection isn&apos;t being intercepted by another
          page or extension impersonating your wallet.
        </p>
        <div className="my-3 grid grid-cols-3 gap-2 border border-outline-variant bg-surface-low p-3">
          {Array.from(phase.emojis).map((emoji, i) => (
            <div key={i} className="flex aspect-square items-center justify-center text-3xl">
              {emoji}
            </div>
          ))}
        </div>
        <p className="mb-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">
          Reject if anything looks different in your wallet
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={reject} className="btn-ghost flex-1 py-2 text-xs uppercase">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="btn-primary flex-1 py-2 text-xs uppercase">
            Emojis match
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Couldn't connect" onClose={reset}>
      <ErrorBody message={phase.message} />
      <button type="button" onClick={reset} className="btn-ghost mt-3 w-full py-2 text-xs uppercase">
        Close
      </button>
    </Modal>
  );
}

// Wallet-type chooser: discovery starts on Connect, not on modal open, so an
// extension's connection prompt fires only on the user's explicit pick.
function ChooseSourceBody({
  beginDiscovery,
}: {
  beginDiscovery: (choice: import("@/lib/wallet-client").WalletChoice) => void;
}) {
  // Extension (Azguard) is disabled until Azguard ships v5 testnet support (#56);
  // the web demo wallet is the working v5 path, so it is the default selection.
  const [selected, setSelected] = useState<import("@/lib/wallet-client").WalletChoice>("web");
  const options: {
    choice: import("@/lib/wallet-client").WalletChoice;
    name: string;
    hint: string;
    icon: ReactNode;
    disabled?: string;
  }[] = [
    {
      choice: "extension",
      name: "Browser Extension",
      hint: "Azguard",
      disabled: "Waiting for Azguard to support the v5 testnet",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
          <path
            d="M9 3.5a2 2 0 014 0V5h3a1 1 0 011 1v3h1.5a2 2 0 010 4H17v3a1 1 0 01-1 1h-3v1.5a2 2 0 01-4 0V17H6a1 1 0 01-1-1v-3H3.5a2 2 0 010-4H5V6a1 1 0 011-1h3V3.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      choice: "web",
      name: "Web Wallet",
      hint: "Aztec Demo Wallet",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M3 12h18M12 3c2.4 2.5 3.7 5.7 3.7 9S14.4 18.5 12 21c-2.4-2.5-3.7-5.7-3.7-9S9.6 5.5 12 3z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-70">
        Choose how to connect to the faucet. Only the wallet you pick will open.
      </p>
      <div className="space-y-2">
        <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">
          Choose Wallet
        </p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => {
            const active = selected === o.choice && !o.disabled;
            return (
              <button
                key={o.choice}
                type="button"
                aria-disabled={o.disabled ? true : undefined}
                aria-pressed={active}
                title={o.disabled}
                onClick={() => {
                  if (!o.disabled) setSelected(o.choice);
                }}
                className={`flex flex-col items-center gap-2 border px-3 py-4 text-center transition-colors ${
                  o.disabled
                    ? "cursor-not-allowed border-outline-variant/40 bg-surface-low/40 opacity-40"
                    : active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-outline-variant bg-surface-low text-on-surface-variant hover:border-accent/60 hover:text-on-surface"
                }`}
              >
                {o.icon}
                <span className="font-label text-[11px] font-bold uppercase tracking-wider">{o.name}</span>
                <span className="font-label text-[9px] uppercase tracking-widest opacity-50">{o.disabled ? "Pending v5" : o.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => beginDiscovery(selected)}
        className="btn-primary w-full py-2.5 text-sm uppercase tracking-wider"
      >
        Connect
      </button>
    </div>
  );
}

function DiscoveringBody({
  providers,
  pickProvider,
  reset,
  retry,
}: {
  providers: import("@/lib/wallet-client").WalletProvider[];
  pickProvider: (p: import("@/lib/wallet-client").WalletProvider) => void;
  reset: () => void;
  retry: () => void;
}) {
  // After 10s with zero providers we'd sit forever on "looking…". Show a
  // Retry path so users who were unlocking can re-probe without dismissing.
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [attempt]);

  const handleRetry = () => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
    retry();
  };

  if (providers.length === 0 && timedOut) {
    return (
      <div className="space-y-3">
        <p className="font-label text-xs leading-relaxed text-on-surface-variant">
          No Aztec wallets found yet. If your wallet is locked, unlock it and
          click Retry. Otherwise, install Azguard to continue.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="block w-full border border-accent bg-accent/10 px-3 py-2 font-label text-xs uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
        >
          Retry
        </button>
        <a
          href="https://chromewebstore.google.com/detail/azguard-wallet/pliilpgjnbkndmcgkfpdmmpkagblcmgi"
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-outline-variant bg-surface-low px-3 py-2 font-label text-xs uppercase tracking-wider text-accent transition-colors hover:bg-accent/5"
        >
          Install Azguard →
        </a>
        <button
          type="button"
          onClick={reset}
          className="btn-ghost w-full py-2 text-[10px] uppercase tracking-widest"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.length === 0 ? (
        <p className="font-label text-xs text-on-surface-variant opacity-70">
          Looking for installed wallets…
        </p>
      ) : (
        providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => pickProvider(p)}
            className="flex w-full items-center gap-3 border border-outline-variant bg-surface-low px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent/5"
          >
            <ProviderIcon icon={p.icon} name={p.name} />
            <span className="font-label text-sm uppercase tracking-wider text-on-surface">
              {p.name}
            </span>
          </button>
        ))
      )}
      <p className="pt-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">
        Approve the request in your wallet extension
      </p>
    </div>
  );
}

function ConnectingBody() {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 2500);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <p className="font-label text-xs text-on-surface-variant opacity-70">
        Establishing secure channel…
      </p>
      {showHint && (
        <p className="mt-3 font-label text-[10px] uppercase tracking-wider leading-relaxed text-on-surface-variant opacity-60">
          Nothing happening? Check your wallet extension. The prompt may be
          hidden behind this window, or your browser&apos;s popup blocker may
          be holding it back.
        </p>
      )}
    </>
  );
}

function ErrorBody({ message }: { message: string }) {
  const lower = message.toLowerCase();

  if (
    lower.includes("no account on the current testnet") ||
    lower.includes("did not grant any accounts") ||
    lower.includes("no accounts") ||
    lower.includes("empty accounts")
  ) {
    return (
      <div className="space-y-2">
        <p className="font-label text-xs leading-relaxed text-red-400">
          {message}
        </p>
        <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-80">
          Switch your wallet to the current testnet and reconnect, or create an
          account on it. You can also claim with the CLI snippet instead.
        </p>
      </div>
    );
  }

  if (lower.includes("popup") || lower.includes("blocked")) {
    return (
      <div className="space-y-2">
        <p className="font-label text-xs leading-relaxed text-red-400">{message}</p>
        <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-80">
          Allow popups for this site in your browser settings, then try again.
        </p>
      </div>
    );
  }

  return <p className="font-label text-xs leading-relaxed text-red-400 wrap-break-word">{message}</p>;
}

function AccountPickerBody({
  accounts,
  pickAccount,
  reset,
}: {
  accounts: string[];
  pickAccount: (address: string) => void;
  reset: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-80">
        Your wallet has multiple accounts. Pick the one to use with the faucet.
      </p>
      {accounts.map((addr) => (
        <button
          key={addr}
          type="button"
          onClick={() => pickAccount(addr)}
          className="flex w-full items-start gap-3 border border-outline-variant bg-surface-low px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent/5"
        >
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 bg-accent/50" aria-hidden="true" />
          <span className="break-all font-mono text-[11px] text-on-surface">{addr}</span>
        </button>
      ))}
      <button type="button" onClick={reset} className="btn-ghost w-full py-2 text-[10px] uppercase tracking-widest">
        Cancel
      </button>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm border border-outline-variant bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-label text-xs font-bold uppercase tracking-widest text-on-surface">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant opacity-50 hover:opacity-100"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
