#!/bin/sh
# Checks the Sepolia ETH balance of an Ethereum address.
# Requires a Sepolia RPC URL (Alchemy, Infura, etc.) — ETH balance checks
# hit the L1 node directly, so a public or your own RPC endpoint is needed.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS \
#     --rpc https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#
# Or set L1_RPC_URL in your environment and omit --rpc:
#   export L1_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS

set -e

REPO_RAW="https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main"

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
echo '{"type":"module"}' > package.json
npm install --no-package-lock viem --silent

curl -fsSL "$REPO_RAW/scripts/check-eth-balance.mjs" -o ~/.aztec-devtools/check-eth-balance.mjs
node ~/.aztec-devtools/check-eth-balance.mjs "$@"
