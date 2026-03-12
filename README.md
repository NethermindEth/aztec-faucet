<div align="center">

<br />

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" width="48" height="48">
  <path d="M16 2L28 16L16 30L4 16L16 2Z" stroke="#D4FF28" stroke-width="1.5" fill="#D4FF28" fill-opacity="0.08"/>
  <path d="M16 8L22 16L16 24L10 16L16 8Z" stroke="#D4FF28" stroke-width="1" fill="#D4FF28" fill-opacity="0.15"/>
</svg>

# Aztec Faucet

**The missing piece between local development and devnet.**
Get L1 ETH and L2 Fee Juice – in one place.

![Sepolia](https://img.shields.io/badge/L1-Sepolia-D4FF28?style=flat-square&labelColor=0a0a0f&color=D4FF28)
![Devnet](https://img.shields.io/badge/L2-Aztec_Devnet-D4FF28?style=flat-square&labelColor=0a0a0f&color=D4FF28)
![SDK](https://img.shields.io/badge/SDK-4.0.0--devnet.2--patch.4-2BFAE9?style=flat-square&labelColor=0a0a0f&color=2BFAE9)

[![Live](https://img.shields.io/badge/Live-aztec--faucet.nethermind.io-D4FF28?style=flat-square&labelColor=0a0a0f&color=D4FF28)](https://aztec-faucet.nethermind.io/)

</div>

---

## The problem

When you move from a local network to devnet, you immediately hit a wall:

- You need **Fee Juice** to pay for your first transaction
- Fee Juice can only be claimed by deploying an account
- Deploying an account requires Fee Juice

The Aztec devnet has no official faucet. The Sponsored FPC can cover your first account deployment – but it gives you nothing to pay for subsequent transactions yourself.

This faucet breaks that loop.

---

## Getting started on devnet

Every new developer on Aztec devnet faces the same bootstrap problem: you need Fee Juice to deploy an account, but you need an account to claim Fee Juice. There are two ways out.

---

### Quickstart - no clone required

The faucet ships shell scripts you can run directly from your terminal. They handle package installation automatically and clean up after themselves.

```bash
# Step 1 - derive your Aztec address (no deployment, no clone)
curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/create-account.sh | sh
# → prints your secret key and Aztec address

# Step 2 - paste the address into the faucet, request Fee Juice
# → wait ~1–2 min for the L1→L2 bridge

# Step 3 - claim (auto-detects deployed vs not)
curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/claim.sh | sh -s -- \
  --secret <your-secret-key> \
  --claim-amount <from faucet> \
  --claim-secret <from faucet> \
  --message-leaf-index <from faucet>
```

The claim command and all its values are pre-filled in the faucet UI - you only need to substitute your secret key.

**What `create-account` actually does:** it does not deploy anything. On Aztec, every account address is derived deterministically from your secret key – the contract can exist on-chain before it is ever deployed. The script computes that address locally and prints it, so you can give it to the faucet immediately.

**What `claim` actually does:**
- If your account is **not yet deployed** → deploys the contract and claims Fee Juice **in a single atomic transaction**, using the claimed Fee Juice itself to pay the deployment fee (`FeeJuicePaymentMethodWithClaim`).
- If your account **is already deployed** → calls `FeeJuice.claim()` directly, paying gas from your existing Fee Juice balance.

---

### Path A - New account: atomic deploy + claim (SDK)

If you are building programmatically and do not have a deployed account yet. No Sponsored FPC involved.

```
1. Derive your Aztec address from your secret key (no network call needed)
         │
         ▼
2. Request Fee Juice from this faucet using that address → receive claim data
         │
         ▼  (~1–2 min for the L1→L2 bridge)
3. Deploy your account + claim Fee Juice in one atomic transaction
   - the claimed Fee Juice pays for the deployment itself
         │
         ▼
4. Account is live. Fee Juice balance is funded. Fully self-sufficient.
```

```ts
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/aztec.js/fields";

// claim data returned by the faucet
const claim = {
  claimAmount: 1000000000000000000000n,
  claimSecret: Fr.fromHexString("0x..."),
  messageLeafIndex: 123n,
};

// deploys your account AND claims Fee Juice in one tx -
// the claimed Fee Juice pays the deployment fee atomically
const paymentMethod = new FeeJuicePaymentMethodWithClaim(accountAddress, claim);
await deployMethod.send({ fee: { paymentMethod } });
```

---

### Path B - Existing account: deploy with Sponsored FPC, then claim

If you have already deployed your account via the Sponsored FPC (e.g. with `aztec-wallet create-account --payment-method=sponsored_fpc --network devnet`), your account exists but has no Fee Juice balance. You claim into it as a separate step.

> **Why the Sponsored FPC?** It is a contract on devnet (`0x09a4df73...caffb2`) that pays transaction fees unconditionally – it breaks the chicken-and-egg problem for your very first deployment. But it gives you no ongoing Fee Juice balance. If you skip it and have no Fee Juice, the only other way to deploy is Path A (atomic claim). There is no third option.

```
1. aztec-wallet create-account --payment-method=sponsored_fpc --network devnet
   → Account deployed, FPC paid the fee, but you have zero Fee Juice
         │
         ▼
2. Request Fee Juice from this faucet → receive claim data
         │
         ▼  (~1–2 min for the L1→L2 bridge)
3. Claim Fee Juice into your existing account
         │
         ▼
4. Account is funded. Fully self-sufficient.
```

**Via SDK:**

```ts
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";

// Step 1 - deploy with Sponsored FPC
const SPONSORED_FPC = AztecAddress.fromString("0x09a4df73aa47f82531a038d1d51abfc85b27665c4b7ca751e2d4fa9f19caffb2");
const paymentMethod = new SponsoredFeePaymentMethod(SPONSORED_FPC);
const deployMethod = await accountManager.getDeployMethod();
await deployMethod.send({ fee: { paymentMethod } });

// Step 2 - after getting claim data from the faucet, claim Fee Juice
import { FeeJuiceContract } from "@aztec/aztec.js/protocol";
import { Fr } from "@aztec/aztec.js/fields";

const feeJuice = FeeJuiceContract.at(wallet);
await feeJuice.methods
  .claim(accountAddress, claim.claimAmount, claim.claimSecret, new Fr(claim.messageLeafIndex))
  .send({ from: accountAddress, fee: { gasSettings } });
```

**Or use the script** (it auto-detects that your account is already deployed):

```bash
curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/claim.sh | sh -s -- \
  --secret <your-account-secret> \
  --claim-amount <from faucet> \
  --claim-secret <from faucet> \
  --message-leaf-index <from faucet>
```

---

## What you get

### `ETH` - L1 Sepolia

Sent directly to your Ethereum address. Use this to pay for L1 transactions and to fund your own bridging operations.

```
0.001 ETH · once per 24 hours · per address
```

---

### `Fee Juice` - L2 gas token

Fee Juice is Aztec's native gas token. Unlike ETH, it **cannot be minted on L2** – it must be bridged from L1 through the Fee Juice Portal contract. The faucet handles the bridge on your behalf and returns everything you need to claim.

```
1000 Fee Juice · once per 24 hours · per address
```

Immediately after the drip, the UI shows a **Sepolia Etherscan link** for the L1 bridge transaction so you can verify it landed on-chain before the bridge window opens.

When the bridge is ready (~1–2 min), you receive:

| Field | Description |
|-------|-------------|
| `claimAmount` | Amount of Fee Juice to claim |
| `claimSecret` | Your private claim secret |
| `messageLeafIndex` | Index of the L1→L2 message in the tree |

The faucet UI pre-fills all of these values into the claim command – you only substitute your secret key.

![Fee Juice claim data ready](./images/fee-juice-complete.png)

---

## Account tab

The faucet UI includes an **Account** tab that generates a throwaway Aztec keypair directly in the browser. No CLI, no wallet extension, and no account deployment required.

- Click **Generate Keypair** to get a fresh secret key and its corresponding Aztec address.
- The address is derived from the secret key using the Schnorr account contract (the same contract used by `aztec-wallet`). No network call to the Aztec node is made.
- Paste the address straight into the Faucet tab to request Fee Juice.
- Once you have saved your secret key, click **I've saved my keys** to clear it from view. The address remains visible so you can still copy it.

Keys are generated server-side using cryptographically secure randomness (`Fr.random()` from the Aztec SDK). They are not stored, not logged, and not sent to any third party.

---

## FAQ tab

The faucet UI includes a **FAQ** tab covering common questions: how the bridge works, claim expiry, mana and fee calculation, Fee Juice non-transferability, rate limits, and more. All answers are sourced from the official Aztec documentation.

---

## Network tab

The faucet UI includes a **Network** tab with two sub-tabs that auto-refresh every 15 seconds.

**Overview**

| Card | What it shows |
|------|---------------|
| Live Fee Rates | Current minimum Fee Juice per mana for DA and L2 dimensions, sourced live from the devnet node. Includes the block number and a fee calculation explainer. |
| Node Health | Online/unreachable status, node version, current block height, L1 chain, and rollup version. |

**Contracts**

All deployed protocol contract addresses in one place, with one-click copy buttons.

| Column | Contracts |
|--------|-----------|
| L1 (Sepolia) | Rollup, Registry, Inbox, Outbox, Fee Juice (L1), Fee Juice Portal, Staking Asset |
| L2 Protocol | Fee Juice, Instance Registry, Class Registry, MultiCall Entrypoint |

---

## Check your Fee Juice balance

The faucet UI includes a **Balance** tab that generates a terminal command with your address pre-filled. You may also run it directly:

```bash
curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
  --address 0x<your-aztec-address>
```

Fee Juice is stored in **public storage** on Aztec, so no wallet or private key is needed – any address's balance is readable directly from the node.

> **Why is balance zero after claiming?** The bridge takes approximately 1–2 minutes. If you check immediately after requesting Fee Juice, the L1→L2 message has not landed yet – wait a moment and check again.

---

## How the Fee Juice bridge works

```
You request Fee Juice
         │
         ▼
Faucet calls bridgeTokensPublic() on the L1 Fee Juice Portal
         │
         ├─ Mints Fee Juice on L1  (devnet privilege)
         ├─ Locks it in the portal contract
         └─ Queues an L1 → L2 message for your address
                    │
                    ▼  (1–2 minutes)
         Aztec sequencer includes the message in a block
                    │
                    ▼
         Claim data is ready - use it to claim on L2
```

The faucet's claim tracker keeps your claim data for **30 minutes**. After that the tracker shows "Expired" and stops serving the data - request again to get a fresh set.

![Bridging Fee Juice to L2](./images/bridging.png)

---

## Devnet details

| | |
|--|--|
| **L1 Network** | Sepolia (`11155111`) |
| **Aztec Node** | `https://v4-devnet-2.aztec-labs.com/` |
| **SDK Version** | `@aztec/*@devnet` (`4.0.0-devnet.2-patch.4`) |
| **Sponsored FPC** | `0x09a4df73...caffb2` |
| **Block Explorer** | [devnet.aztecscan.xyz](https://devnet.aztecscan.xyz) |

---

## UI tabs

The faucet has six tabs:

| Tab | What it does |
|-----|-------------|
| **Faucet** | Request ETH (Sepolia) or Fee Juice. After a Fee Juice drip, shows a clickable Sepolia Etherscan link for the L1 bridge tx and a live claim tracker with pre-filled CLI and SDK snippets once the bridge is ready. |
| **Account** | Generate a throwaway Aztec keypair (secret key + address) in the browser. No CLI, no wallet, no deployment needed. Keys are generated server-side using cryptographically secure randomness and never stored or logged. |
| **Balance** | Check the Fee Juice balance of any Aztec address directly from the node. |
| **Network** | Live fee rates, node health, and all L1/L2 protocol contract addresses. Auto-refreshes every 15 seconds. |
| **FAQ** | Common questions about the bridge, mana, claim expiry, rate limits, and more. |
| **Donate** | Send Sepolia ETH to the faucet wallet to help keep it funded. Shows the faucet address with a copy button and a direct Etherscan link. |

---

<div align="center">

[Aztec Documentation](https://docs.aztec.network) · [Getting Started on Devnet](https://docs.aztec.network/developers/getting_started_on_devnet) · [aztec.js SDK](https://docs.aztec.network/developers/docs/aztec-js)

---

Developed by [Giri-Aayush](https://github.com/Giri-Aayush) · [MIT License](./LICENSE)

---

A [Nethermind](https://nethermind.io) product.

</div>
