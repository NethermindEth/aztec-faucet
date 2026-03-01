import { FaucetForm } from "@/components/faucet-form";
import { NetworkStatus } from "@/components/network-status";

export default function Home() {
  return (
    <main className="bg-atmosphere flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center animate-fade-up">
          <div className="mb-5 flex justify-center">
            <svg
              viewBox="0 0 32 32"
              fill="none"
              className="h-9 w-9 text-chartreuse"
            >
              <path
                d="M16 2L28 16L16 30L4 16L16 2Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="currentColor"
                fillOpacity="0.08"
              />
              <path
                d="M16 8L22 16L16 24L10 16L16 8Z"
                stroke="currentColor"
                strokeWidth="1"
                fill="currentColor"
                fillOpacity="0.15"
              />
            </svg>
          </div>
          <h1 className="font-display text-4xl tracking-tight text-white">
            Aztec <span className="text-chartreuse">Faucet</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            Test tokens for building on the Aztec devnet
          </p>
        </div>

        {/* Network status */}
        <div className="animate-fade-up animate-delay-1">
          <NetworkStatus />
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6 animate-fade-up animate-delay-2">
          <FaucetForm />
        </div>

        {/* Footer info */}
        <div className="mt-8 space-y-3 animate-fade-up animate-delay-3">
          <details className="group glass-card rounded-xl">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-400 transition-colors hover:text-white">
              How does this work?
            </summary>
            <div className="space-y-2 border-t border-white/6 px-4 py-3 text-xs text-zinc-500">
              <p>
                <strong className="text-zinc-300">L1 ETH:</strong> Sent directly
                to your Ethereum address on the configured L1 chain. Used for L1
                gas fees.
              </p>
              <p>
                <strong className="text-zinc-300">Fee Juice:</strong> Aztec&apos;s
                L2 gas token — required to pay for every transaction on Aztec. It
                must be{" "}
                <strong className="text-zinc-300">bridged from L1 to L2</strong>{" "}
                through the Fee Juice Portal contract. After bridging, the Aztec
                sequencer picks up the L1→L2 message (usually within 1-2 minutes)
                and you receive claim data. Use that data with{" "}
                <code className="rounded bg-white/6 px-1 font-mono">
                  FeeJuicePaymentMethodWithClaim
                </code>{" "}
                when deploying your account, or claim directly if your account is
                already deployed.
              </p>
              <p>
                <strong className="text-zinc-300">Test Token:</strong> An ERC20
                token minted directly on Aztec L2 to your public balance. Useful
                for testing transfers and contract interactions.
              </p>
            </div>
          </details>

          <div className="text-center text-xs text-zinc-600">
            <p>Rate limited to one request per token per hour.</p>
            <p className="mt-1">
              <a
                href="https://docs.aztec.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-chartreuse/60 transition-colors hover:text-chartreuse"
              >
                Aztec Documentation
              </a>
              {" · "}
              <a
                href="https://docs.aztec.network/guides/getting_started"
                target="_blank"
                rel="noopener noreferrer"
                className="text-chartreuse/60 transition-colors hover:text-chartreuse"
              >
                Getting Started
              </a>
              {" · "}
              <a
                href="/api/status"
                target="_blank"
                rel="noopener noreferrer"
                className="text-chartreuse/60 transition-colors hover:text-chartreuse"
              >
                API Status
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
