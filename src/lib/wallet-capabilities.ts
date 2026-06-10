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
            // Undeployed accounts: claim_and_end_setup runs in the
            // FeeJuicePaymentMethodWithClaim setup phase, and check_balance(0n)
            // is the outer no-op that gives the wallet something to
            // entrypoint-wrap (which is what bundles the account deploy).
            // Initialized accounts: plain claim() with fee from existing FJ.
            { contract: feeJuice, function: "claim" },
            { contract: feeJuice, function: "claim_and_end_setup" },
            { contract: feeJuice, function: "check_balance" },
          ],
        },
      },
      {
        type: "transaction",
        scope: [
          { contract: feeJuice, function: "claim" },
          { contract: feeJuice, function: "claim_and_end_setup" },
          { contract: feeJuice, function: "check_balance" },
        ],
      },
    ],
  };
}
