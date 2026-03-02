#!/bin/sh
# Claims bridged Fee Juice on Aztec L2.
# Auto-detects if your account is deployed:
#   - Not deployed → deploys + claims in one atomic tx (Fee Juice pays for itself)
#   - Already deployed → calls FeeJuice.claim() directly
#
# The faucet UI pre-fills --claim-amount, --claim-secret, and --message-leaf-index.
# You only need to supply your --secret key.
#
# Usage (copy from the faucet UI — values are pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/claim.sh | sh -s -- \
#     --secret <YOUR_SECRET_KEY> \
#     --claim-amount <pre-filled> \
#     --claim-secret <pre-filled> \
#     --message-leaf-index <pre-filled>

set -e

REPO_RAW="https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main"

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
echo '{"type":"module"}' > package.json
npm install --no-package-lock @aztec/wallets@devnet @aztec/aztec.js@devnet @aztec/stdlib@devnet --silent

curl -fsSL "$REPO_RAW/scripts/claim-fee-juice.mjs" -o ~/.aztec-devtools/claim-fee-juice.mjs
node ~/.aztec-devtools/claim-fee-juice.mjs "$@"
