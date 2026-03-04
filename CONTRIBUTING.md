# Contributing to Aztec Faucet

Thanks for your interest in contributing. This is a small, focused tool — the goal is to keep it reliable and easy to run, not to accumulate features. That said, bug fixes, improvements, and well-scoped additions are very welcome.

---

## Before you start

- Check the [open issues](https://github.com/NethermindEth/aztec-faucet/issues) to see if someone is already working on your idea.
- For anything beyond a minor fix, open an issue first and describe what you're thinking. It avoids wasted effort and ensures the change aligns with the project direction.

---

## Setting up locally

**Requirements:** Node.js 20+, npm

```bash
git clone https://github.com/NethermindEth/aztec-faucet.git
cd aztec-faucet
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts on http://localhost:3000
```

See [`.env.example`](./.env.example) for all required environment variables. You'll need an L1 RPC URL (Sepolia), a funded private key, and an Aztec node URL.

---

## Making changes

- **Keep PRs focused.** One thing per PR makes review much faster.
- **Match the existing style.** The project uses TypeScript, Tailwind, and Next.js App Router. Look at nearby code before adding something new.
- **Don't add abstractions for one-off things.** If something is used once, just write it inline.
- **Test your change manually** before opening a PR. There's no automated test suite yet — a quick local run to verify the happy path is expected.

---

## Submitting a pull request

1. Fork the repo and create a branch off `main`.
2. Make your changes and verify them locally.
3. Write a clear PR description explaining *what* changed and *why*.
4. Open the PR against `main`.

PR titles follow this rough convention:
```
fix: description of what was broken
feat: description of new capability
chore: dependency update or housekeeping
```

---

## What we're not looking for

- Feature requests that go beyond the core faucet use case (request ETH / Fee Juice, check balance, network info).
- Changes that add significant complexity or new dependencies for marginal benefit.
- Reformatting PRs that don't change behavior.

If you're unsure whether something is in scope, open an issue and ask. We'd rather say "not quite" early than after you've written the code.

---

## Questions

Open an issue or reach out in the [Aztec Discord](https://discord.gg/aztec).
