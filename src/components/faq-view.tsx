"use client";

import { useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Does my secret key ever leave my device?",
    answer:
      "Your secret key never touches any server. The SDK snippets and curl commands run entirely on your own machine, so your keys stay local. The faucet only sees your Aztec address.",
  },
  {
    question: "Why does it take a minute or two to receive Fee Juice?",
    answer:
      "When the faucet bridges Fee Juice, it sends a message through the Fee Juice Portal on L1. That message sits in a pending state until the next Aztec rollup block is processed. Once a rollup is proven and submitted, the message moves from pending to ready and you can claim it. On testnet this typically takes one to two minutes depending on block timing.",
  },
  {
    question: "My claim proof seems to have expired. What happened?",
    answer:
      "The faucet's claim tracker keeps your claim data for 30 minutes. After that it shows 'Expired' and stops serving the data through the UI. If you saved the original claim response from the faucet, you may still be able to use it on-chain. Otherwise, request a fresh batch and use the new claim data straight away.",
  },
  {
    question: "How often can I request tokens?",
    answer:
      "Each wallet address can request once every 24 hours per asset. So you can get ETH once per day and Fee Juice once per day. If you hit the limit, try again the next day.",
  },
  {
    question: "What is Fee Juice exactly?",
    answer:
      "Fee Juice is the gas token for the Aztec network, similar to how ETH pays for gas on Ethereum. Every transaction you send on Aztec needs a small amount of Fee Juice. The faucet bridges it from L1 so you can start transacting without needing to buy or bridge anything yourself.",
  },
  {
    question: "Why do I need an Aztec address instead of just my Ethereum address?",
    answer:
      "Aztec and Ethereum are separate networks with different address formats. Aztec accounts live on L2 and are created using the Aztec SDK. Fee Juice and test tokens go directly to your Aztec address on L2, while the ETH goes to your Ethereum address on Sepolia.",
  },
  {
    question: "Will these tokens work on Aztec mainnet?",
    answer:
      "No. These are testnet tokens only and have no real value. They work on the Aztec testnet for building and testing. Never use a wallet with real funds on this faucet.",
  },
  {
    question: "I already deployed my account. Can I still claim Fee Juice?",
    answer:
      "Yes! If your account is already deployed, you can claim the bridged Fee Juice using the Aztec CLI or the SDK snippet shown in the claim tracker. The faucet bridges the tokens regardless of whether your account is deployed yet. Just use the claim data before the proof expires.",
  },
  {
    question: "What is mana?",
    answer:
      "Mana is Aztec's unit of computational effort, equivalent to gas on Ethereum. Every transaction consumes mana across two dimensions: DA mana (cost of publishing data to the data availability layer) and L2 mana (cost of executing the transaction). The total fee is calculated as (daMana x feePerDaMana) + (l2Mana x feePerL2Mana). Note that the Aztec SDK uses \"gas\" in variable names like feePerDaGas, but mana is the correct conceptual term.",
  },
  {
    question: "What are the fee numbers in the Network tab?",
    answer:
      "The fee rates show the current minimum Fee Juice per mana for DA and L2 dimensions. Fee Juice uses 18 decimal places, the same as ETH, so the values shown are in base units. To convert to whole Fee Juice, divide by 10^18. The faucet sends you 1,000 Fee Juice, enough to cover many transactions on the testnet.",
  },
  {
    question: "Can I send Fee Juice to another address?",
    answer:
      "No. Fee Juice is non-transferable, meaning it can only be used to pay transaction fees on Aztec and cannot be sent between accounts. This is by design, as Fee Juice exists solely as a fee payment mechanism. If you need to fund another address, request Fee Juice directly for that address from this faucet.",
  },
];

function FaqAccordion({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="bg-surface-container overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-body text-sm font-medium text-on-surface pr-4">{item.question}</span>
        <span
          className={`shrink-0 text-accent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? "rotate-45" : ""}`}
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-outline-variant/30 px-5 pb-4 pt-3">
            <p className="font-body text-sm leading-relaxed text-on-surface-variant opacity-70">{item.answer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FaqView() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  const left = FAQ_ITEMS.filter((_, i) => i % 2 === 0);
  const right = FAQ_ITEMS.filter((_, i) => i % 2 === 1);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 border-b border-outline-variant pb-6">
        <h2 className="font-headline text-3xl italic text-on-surface">Frequently Asked</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
        <div className="space-y-2">
          {left.map((item) => {
            const i = FAQ_ITEMS.indexOf(item);
            return (
              <FaqAccordion
                key={i}
                item={item}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            );
          })}
        </div>
        <div className="space-y-2">
          {right.map((item) => {
            const i = FAQ_ITEMS.indexOf(item);
            return (
              <FaqAccordion
                key={i}
                item={item}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-6 text-center font-label text-xs text-on-surface-variant opacity-40 uppercase tracking-widest">
        Still have questions?{" "}
        <a
          href="https://docs.aztec.network"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent/60 transition-colors hover:text-accent"
        >
          Read the Aztec docs
        </a>
      </p>
    </div>
  );
}
