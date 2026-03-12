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

REPO_BRANCH="dev"
REPO_RAW="https://raw.githubusercontent.com/NethermindEth/aztec-faucet/$REPO_BRANCH"

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

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_VERSION="${AZTEC_SDK_VERSION:-4.0.0-devnet.2-patch.4}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

_pkgs=""
[ "$(_pkg_ver "@aztec/aztec.js")" != "$AZTEC_SDK_VERSION" ] && _pkgs="$_pkgs @aztec/aztec.js@devnet"
[ "$(_pkg_ver "@aztec/stdlib")"   != "$AZTEC_SDK_VERSION" ] && _pkgs="$_pkgs @aztec/stdlib@devnet"

if [ -n "$_pkgs" ]; then
  [ ! -f package.json ] && printf '{"type":"module"}' > package.json
  npm install --no-package-lock $_pkgs --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages"
  wait $_npm_pid
fi

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
