"use client";

import { useState } from "react";
import { CopyButton } from "./drip-result";
import { NETWORK_LABEL } from "@/lib/network-config";

type KeypairState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; secretKey: string; address: string }
  | { status: "saved"; address: string }
  | { status: "error"; message: string };

export function KeygenView() {
  const networkLabel = NETWORK_LABEL;
  const [state, setState] = useState<KeypairState>({ status: "idle" });
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [rateLimitOpen, setRateLimitOpen] = useState(false);

  function destroy() {
    setLeaving(true);
    setTimeout(() => {
      setState({ status: "idle" });
      setLeaving(false);
    }, 300);
  }

  function saveKeys(address: string) {
    setLeaving(true);
    setTimeout(() => {
      setState({ status: "saved", address });
      setLeaving(false);
    }, 300);
  }

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/keygen");
      const data = await res.json() as { secretKey: string; address: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to generate keypair");
      setEntering(true);
      setState({ status: "ready", secretKey: data.secretKey, address: data.address });
      requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({ status: "error", message: msg.slice(0, 300) });
    }
  }

  const hasKeypair = state.status === "ready" || state.status === "saved";
  const showGenerate = state.status === "idle" || state.status === "loading" || state.status === "error";

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="bg-surface-container p-5 sm:p-8 shadow-2xl">
        <div className="mb-6 border-b border-outline-variant pb-6">
          <h2 className="font-headline text-2xl uppercase tracking-tight text-on-surface">Generate Keypair</h2>
          <p className="mt-1 font-label text-xs text-on-surface-variant opacity-60 uppercase tracking-wider">
            Get a fresh secret key and Aztec address for {networkLabel.toLowerCase()} testing. No CLI or wallet required.
          </p>
        </div>

        {/* Warning */}
        <div className="mb-5 border-l-4 border-amber-500 bg-amber-500/5 px-5 py-3">
          <p className="font-body text-xs text-amber-400/80">
            <strong className="text-amber-400">For {networkLabel.toLowerCase()} testing only.</strong>{" "}
            This generates a throwaway keypair. Do not use it to store real funds or on any network other than the Aztec {networkLabel.toLowerCase()}.
          </p>
        </div>

        {/* Generate button */}
        {showGenerate && (
          <div className="animate-panel-state-in">
            <button
              type="button"
              onClick={generate}
              disabled={state.status === "loading"}
              className="btn-primary w-full py-4 text-base"
            >
              {state.status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  GENERATING...
                </span>
              ) : (
                "GENERATE KEYPAIR"
              )}
            </button>

            {state.status === "error" && (
              <div className="mt-4 border-l-4 border-red-500 bg-red-500/10 p-4">
                <p className="font-label text-xs text-red-400">Failed to generate keypair</p>
                <p className="mt-1 font-label text-[11px] text-red-400/70">{state.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Keypair section */}
        {(hasKeypair || leaving) && (
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: (leaving || entering) ? "0fr" : "1fr" }}
          >
            <div className="overflow-hidden">
              <div
                className="space-y-3 transition-opacity duration-200"
                style={{ opacity: (leaving || entering) ? 0 : 1 }}
              >
                {state.status === "ready" && (
                  <>
                    <div className="bg-surface-low p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">Secret Key</span>
                        <CopyButton text={state.secretKey} />
                      </div>
                      <code className="block truncate font-label text-[11px] leading-relaxed text-on-surface">
                        {state.secretKey}
                      </code>
                      <p className="mt-2 font-label text-[10px] text-on-surface-variant opacity-40 uppercase tracking-wider">
                        Keep this private. Use it with the claim script or the Aztec SDK.
                      </p>
                    </div>

                    <div className="bg-accent/5 border-l-4 border-accent p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">Aztec Address</span>
                        <CopyButton text={state.address} />
                      </div>
                      <code className="block truncate font-label text-[11px] leading-relaxed text-accent">
                        {state.address}
                      </code>
                      <p className="mt-2 font-label text-[10px] text-on-surface-variant opacity-40 uppercase tracking-wider">
                        Paste this into the Faucet tab to request Fee Juice.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => saveKeys(state.address)}
                        className="flex-1 flex items-center justify-center gap-2 border-2 border-accent bg-accent/10 px-4 py-2.5 font-label text-xs font-bold uppercase tracking-wider text-accent transition-all hover:bg-accent/20"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        I&apos;ve saved my keys
                      </button>
                      <button
                        type="button"
                        onClick={destroy}
                        className="flex items-center justify-center gap-2 border-2 border-red-500/30 bg-red-500/10 px-4 py-2.5 font-label text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Destroy
                      </button>
                    </div>
                  </>
                )}

                {state.status === "saved" && (
                  <>
                    <div className="bg-accent/5 border-l-4 border-accent p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-50">Aztec Address</span>
                        <CopyButton text={state.address} />
                      </div>
                      <code className="block truncate font-label text-[11px] leading-relaxed text-accent">
                        {state.address}
                      </code>
                    </div>

                    <div className="bg-accent/5 border-l-2 border-accent/30 px-5 py-3">
                      <p className="font-body text-xs text-accent/70">
                        <strong className="text-accent/90">Secret key cleared from view.</strong>{" "}
                        Your address is kept so you can still copy it. Generate a new keypair or destroy when done.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={generate}
                        className="flex-1 btn-primary py-2.5 text-xs"
                      >
                        GENERATE NEW KEYPAIR
                      </button>
                      <button
                        type="button"
                        onClick={destroy}
                        className="flex items-center justify-center gap-2 border-2 border-red-500/30 bg-red-500/10 px-4 py-2.5 font-label text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Destroy
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Privacy notice */}
        <div className="mt-5 flex items-start gap-2 font-label text-[10px] text-on-surface-variant opacity-40 uppercase tracking-wider">
          <svg viewBox="0 0 16 16" fill="none" className="mt-0.5 h-3 w-3 shrink-0">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" />
            <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="normal-case">
            Keypair generated server-side using cryptographically secure randomness. Not sent to any third party, not stored, not logged. Address derived on the server from your secret key using the Schnorr account contract. No network call to the Aztec node is needed.
          </span>
        </div>
      </div>

      {/* Deploy accordion */}
      <div className="mt-3 bg-surface-container overflow-hidden">
        <button
          type="button"
          onClick={() => setDeployOpen(!deployOpen)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent">
            Is my account deployed?
          </span>
          <span className={`text-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${deployOpen ? "rotate-45" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: deployOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="space-y-2 border-t border-outline-variant/30 px-5 py-3 font-body text-xs text-on-surface-variant opacity-70">
              <p>
                <span className="font-medium text-on-surface">Not yet.</span> This keypair gives you a deterministic Aztec address, but no contract is deployed on-chain yet.
              </p>
              <p>
                Your account contract is deployed automatically the first time you claim Fee Juice through the <span className="text-on-surface font-medium">Faucet tab</span>. The deploy and claim happen in a single atomic transaction, paid for by the Fee Juice itself. Just paste your address into the Faucet tab and request Fee Juice.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rate limit accordion */}
      <div className="mt-3 bg-surface-container overflow-hidden">
        <button
          type="button"
          onClick={() => setRateLimitOpen(!rateLimitOpen)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          <span className="font-label text-xs uppercase tracking-wider text-on-surface-variant transition-colors hover:text-accent">
            How many accounts can I create?
          </span>
          <span className={`text-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${rateLimitOpen ? "rotate-45" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: rateLimitOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="space-y-2 border-t border-outline-variant/30 px-5 py-3 font-body text-xs text-on-surface-variant opacity-70">
              <p>
                This faucet allows <span className="text-on-surface font-medium">10 keypairs per 24 hours per IP</span>. This is enough for typical testing.
              </p>
              <p>
                If you need more, you can generate accounts locally with no limits using{" "}
                <a
                  href="https://docs.aztec.network/guides/developer_guides/js_apps/aztec-js"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/80 hover:text-accent underline underline-offset-2"
                >
                  Aztec.js
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
