#!/bin/sh
# Checks the Fee Juice balance of an Aztec address.
# Fee Juice is stored in public state, so no wallet or private key is needed.
#
# The faucet UI pre-fills --address with your Aztec address.
#
# Usage (copy from the faucet UI — address is pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
#     --address <pre-filled>
#
# Against a custom node:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
#     --address 0xYOUR_ADDRESS \
#     --node https://your-node-url

set -e

REPO_RAW="https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main"

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
echo '{"type":"module"}' > package.json
npm install --no-package-lock @aztec/aztec.js@devnet @aztec/stdlib@devnet --silent

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" -o ~/.aztec-devtools/check-fee-juice-balance.mjs
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@"
