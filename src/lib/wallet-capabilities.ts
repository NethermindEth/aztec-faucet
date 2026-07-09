"use client";

import type { AppCapabilities } from "@aztec/aztec.js/wallet";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";

export function faucetCapabilities(): AppCapabilities {
  const feeJuice = ProtocolContractAddress.FeeJuice;
  return {
    version: "1.0",
    metadata: {
      name: "Aztec Faucet",
      version: "0.1.0",
      description: "Bridge Fee Juice and ETH to your Aztec account",
      url: typeof window !== "undefined"
        ? window.location.origin
        : "https://aztec-faucet.dev-nethermind.xyz",
    },
    capabilities: [
      { type: "accounts", canGet: true, canCreateAuthWit: false },
      {
        type: "contracts",
        contracts: [feeJuice],
        canRegister: true,
        canGetMetadata: true,
      },
      {
        type: "simulation",
        utilities: { scope: [] },
        transactions: {
          scope: [
            // The claim flow sends check_balance(0n) with claim_and_end_setup
            // riding in the fee payload; plain claim is never invoked.
            // additionalScopes "*" lets these functions read notes from every
            // contract the deploy+claim touches (multicall entrypoint, auth and
            // handshake registries, etc). A strict wallet (the demo web wallet)
            // rejects the claim without it; scoped to these two functions only,
            // not a blanket grant.
            { contract: feeJuice, function: "claim_and_end_setup", additionalScopes: "*" },
            { contract: feeJuice, function: "check_balance", additionalScopes: "*" },
          ],
        },
      },
      {
        type: "transaction",
        scope: [
          { contract: feeJuice, function: "claim_and_end_setup", additionalScopes: "*" },
          { contract: feeJuice, function: "check_balance", additionalScopes: "*" },
        ],
      },
    ],
  };
}
