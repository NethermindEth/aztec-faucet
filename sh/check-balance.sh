#!/bin/sh
# Checks the Fee Juice balance of an Aztec address.
# Fee Juice is stored in public state, so no wallet or private key is needed.
#
# Usage (copy from the faucet UI — address is pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
#     --address <pre-filled>
#
# Against a custom node:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
#     --address 0xYOUR_ADDRESS \
#     --node https://your-node-url

set -e

REPO_RAW="https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main"

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

printf '\n  Aztec Fee Juice Balance Checker\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
printf '{"type":"module"}' > package.json

npm install --no-package-lock @aztec/aztec.js@devnet @aztec/stdlib@devnet --silent > /dev/null 2>&1 &
_npm_pid=$!
spin $_npm_pid "Installing packages"
wait $_npm_pid

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" \
  -o ~/.aztec-devtools/check-fee-juice-balance.mjs 2>/dev/null

_out=$(mktemp)
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@" > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching balance from Aztec devnet"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
