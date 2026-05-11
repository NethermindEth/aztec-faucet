"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  start: () => void;
  onConnected?: (address: string) => void;
};

export function WalletConnectModal({ phase, pickProvider, confirm, reject, reset, start, onConnected }: Props) {
  if (phase.kind === "idle") return null;

  if (phase.kind === "connected") {
    onConnected?.(phase.address);
    return null;
  }

  if (phase.kind === "discovering") {
    return (
      <Modal title="Choose a wallet" onClose={reset}>
        <DiscoveringBody providers={phase.providers} pickProvider={pickProvider} reset={reset} start={start} />
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

function DiscoveringBody({
  providers,
  pickProvider,
  reset,
  start,
}: {
  providers: import("@/lib/wallet-client").WalletProvider[];
  pickProvider: (p: import("@/lib/wallet-client").WalletProvider) => void;
  reset: () => void;
  start: () => void;
}) {
  // After 10s with zero providers we'd sit forever on "looking…". Show a
  // Retry path so users who were unlocking can re-probe without dismissing.
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [attempt]);

  const handleRetry = () => {
    setAttempt((a) => a + 1);
    start();
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
    lower.includes("did not grant any accounts") ||
    lower.includes("no accounts") ||
    lower.includes("empty accounts")
  ) {
    return (
      <div className="space-y-2">
        <p className="font-label text-xs leading-relaxed text-red-400">
          Your wallet has no Aztec account yet.
        </p>
        <p className="font-label text-[11px] leading-relaxed text-on-surface-variant opacity-80">
          Open your wallet extension, create or import an Aztec account on the
          testnet network, then click Connect again.
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

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
