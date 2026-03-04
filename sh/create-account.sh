#!/bin/sh
# Derives a new Aztec account address (or an existing one from a secret key).
# Nothing is deployed — just prints your secret key and address.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main/sh/create-account.sh | sh
#
# With an existing secret key:
#   curl -fsSL https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main/sh/create-account.sh | sh -s -- \
#     --secret 0xYOUR_SECRET

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

printf '\n  Aztec Account Generator\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
printf '{"type":"module"}' > package.json

npm install --no-package-lock @aztec/wallets@devnet @aztec/aztec.js@devnet --silent > /dev/null 2>&1 &
_npm_pid=$!
spin $_npm_pid "Installing packages"
wait $_npm_pid

curl -fsSL "$REPO_RAW/scripts/create-aztec-account.mjs" \
  -o ~/.aztec-devtools/create-aztec-account.mjs 2>/dev/null

_out=$(mktemp)
node ~/.aztec-devtools/create-aztec-account.mjs "$@" > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Generating account"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
