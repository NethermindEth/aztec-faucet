#!/bin/sh
# Checks the Sepolia ETH balance of an Ethereum address.
# Requires a Sepolia RPC URL (Alchemy, Infura, etc.)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS \
#     --rpc https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#
# Or set L1_RPC_URL in your environment and omit --rpc:
#   export L1_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#   curl -fsSL https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS

set -e

REPO_RAW="https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main"

# spin <pid> <message> — shows a spinner until <pid> exits, then prints a checkmark
spin() {
  _pid=$1 _msg=$2 _i=0
  while kill -0 "$_pid" 2>/dev/null; do
    _i=$(( (_i + 1) % 4 ))
    case $_i in 0) _c='-' ;; 1) _c='\\' ;; 2) _c='|' ;; *) _c='/' ;; esac
    printf '\r  \033[2m%s\033[0m  %s' "$_c" "$_msg"
    sleep 0.1
  done
  printf '\r  \033[32m✓\033[0m  %-50s\n' "$_msg"
}

printf '\n  Sepolia ETH Balance Checker\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
printf '{"type":"module"}' > package.json

npm install --no-package-lock viem --silent > /dev/null 2>&1 &
_npm_pid=$!
spin $_npm_pid "Installing packages"
wait $_npm_pid

curl -fsSL "$REPO_RAW/scripts/check-eth-balance.mjs" \
  -o ~/.aztec-devtools/check-eth-balance.mjs 2>/dev/null

_out=$(mktemp)
node ~/.aztec-devtools/check-eth-balance.mjs "$@" > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching ETH balance from Sepolia"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
