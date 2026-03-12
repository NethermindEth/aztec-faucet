"use client";

import { useState } from "react";
import { CopyButton } from "./drip-result";

type KeypairState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; secretKey: string; address: string }
  | { status: "saved"; address: string }
  | { status: "error"; message: string };

export function KeygenView() {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate keypair");
      setEntering(true);
      setState({ status: "ready", secretKey: data.secretKey, address: data.address });
      // Double rAF: first ensures the 0fr state is painted, second triggers the expand transition
      requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({ status: "error", message: msg.slice(0, 300) });
    }
  }

  const hasKeypair = state.status === "ready" || state.status === "saved";
  const showGenerate = state.status === "idle" || state.status === "loading" || state.status === "error";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="glass-card rounded-2xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-white">Generate Keypair</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Get a fresh secret key and Aztec address for devnet testing. No CLI or wallet required.
          </p>
        </div>

        {/* Devnet warning */}
        <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-400/80">
            <strong className="text-amber-400">For devnet testing only.</strong>{" "}
            This generates a throwaway keypair. Do not use it to store real funds or on any network other than the Aztec devnet.
          </p>
        </div>

        {/* Generate button — animates in each time it appears */}
        {showGenerate && (
          <div className="animate-panel-state-in">
            <button
              type="button"
              onClick={generate}
              disabled={state.status === "loading"}
              className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
            >
              {state.status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                "Generate Keypair"
              )}
            </button>

            {/* Error */}
            {state.status === "error" && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/6 p-4">
                <p className="text-xs font-medium text-red-400">Failed to generate keypair</p>
                <p className="mt-1 text-[11px] text-red-400/70">{state.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Keypair section — grid-rows collapse so height animates smoothly on destroy */}
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
                {/* Ready — show full keypair */}
                {state.status === "ready" && (
                  <>
                    <div className="rounded-xl border border-white/6 bg-white/2 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Secret Key</span>
                        <CopyButton text={state.secretKey} />
                      </div>
                      <code className="block truncate font-mono text-[11px] leading-relaxed text-zinc-300">
                        {state.secretKey}
                      </code>
                      <p className="mt-2 text-[10px] text-zinc-600">
                        Keep this private. Use it with the claim script or the Aztec SDK.
                      </p>
                    </div>

                    <div className="rounded-xl border border-chartreuse/20 bg-chartreuse/3 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Aztec Address</span>
                        <CopyButton text={state.address} />
                      </div>
                      <code className="block truncate font-mono text-[11px] leading-relaxed text-chartreuse">
                        {state.address}
                      </code>
                      <p className="mt-2 text-[10px] text-zinc-600">
                        Paste this into the Faucet tab to request Fee Juice.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => saveKeys(state.address)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-chartreuse/30 bg-chartreuse/8 px-4 py-2.5 text-xs font-medium text-chartreuse transition-all hover:bg-chartreuse/15"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        I've saved my keys
                      </button>
                      <button
                        type="button"
                        onClick={destroy}
                        className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-2.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/12"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Destroy
                      </button>
                    </div>
                  </>
                )}

                {/* Saved — secret key cleared, address kept */}
                {state.status === "saved" && (
                  <>
                    <div className="rounded-xl border border-chartreuse/20 bg-chartreuse/3 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Aztec Address</span>
                        <CopyButton text={state.address} />
                      </div>
                      <code className="block truncate font-mono text-[11px] leading-relaxed text-chartreuse">
                        {state.address}
                      </code>
                    </div>

                    <div className="rounded-xl border border-chartreuse/10 bg-chartreuse/4 px-4 py-3">
                      <p className="text-xs text-chartreuse/70">
                        <strong className="text-chartreuse/90">Secret key cleared from view.</strong>{" "}
                        Your address is kept so you can still copy it. Generate a new keypair or destroy when done.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={generate}
                        className="flex-1 btn-primary rounded-xl px-4 py-2.5 text-xs"
                      >
                        Generate New Keypair
                      </button>
                      <button
                        type="button"
                        onClick={destroy}
                        className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-2.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/12"
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
        <div className="mt-5 flex items-start gap-2 text-[10px] text-zinc-600">
          <svg viewBox="0 0 16 16" fill="none" className="mt-0.5 h-3 w-3 shrink-0">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" />
            <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>
            Keypair generated server-side using cryptographically secure randomness. Not sent to any third party, not stored, not logged. The address is derived locally on the server from your secret key using the Schnorr account contract. No network call to the Aztec node is needed.
          </span>
        </div>
      </div>
      {/* Deploy accordion */}
      <div className="mt-3 glass-card rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setDeployOpen(!deployOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-medium text-zinc-400 transition-colors hover:text-white">
            Is my account deployed?
          </span>
          <span className={`text-chartreuse transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${deployOpen ? "rotate-45" : ""}`}>
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
            <div className="space-y-2 border-t border-white/6 px-4 py-3 text-xs text-zinc-500">
              <p>
                <span className="font-medium text-zinc-300">Not yet.</span> This keypair gives you a deterministic Aztec address, but no contract is deployed on-chain yet.
              </p>
              <p>
                Your account contract is deployed automatically the first time you claim Fee Juice through the <span className="text-zinc-300 font-medium">Faucet tab</span>. The deploy and claim happen in a single atomic transaction, paid for by the Fee Juice itself. Just paste your address into the Faucet tab and request Fee Juice.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rate limit accordion */}
      <div className="mt-3 glass-card rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setRateLimitOpen(!rateLimitOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-medium text-zinc-400 transition-colors hover:text-white">
            How many accounts can I create?
          </span>
          <span className={`text-chartreuse transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${rateLimitOpen ? "rotate-45" : ""}`}>
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
            <div className="space-y-2 border-t border-white/6 px-4 py-3 text-xs text-zinc-500">
              <p>
                This faucet allows <span className="text-zinc-300 font-medium">10 keypairs per 24 hours per IP</span>. This is enough for typical devnet testing.
              </p>
              <p>
                If you need more, you can generate accounts locally with no limits using{" "}
                <a
                  href="https://docs.aztec.network/guides/developer_guides/js_apps/aztec-js"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-chartreuse/80 hover:text-chartreuse underline underline-offset-2"
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
