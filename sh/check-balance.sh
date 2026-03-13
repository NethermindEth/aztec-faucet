#!/bin/sh
# Checks the Fee Juice balance of an Aztec address.
# Fee Juice is stored in public state, so no wallet or private key is needed.
#
# Usage (copy from the faucet UI — address is pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-balance.sh | sh -s -- \
#     --address <pre-filled> \
#     [--network testnet]
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

# Parse --network flag (other args are passed through to the mjs)
_network="devnet"
_has_custom_node=0
_prev=""
for _arg in "$@"; do
  if [ "$_arg" = "testnet" ] && [ "$_prev" = "--network" ]; then
    _network="testnet"
  fi
  if [ "$_prev" = "--node" ]; then
    _has_custom_node=1
  fi
  _prev="$_arg"
done

printf '\n  Aztec Fee Juice Balance Checker (%s)\n\n' "$_network"

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_VERSION="${AZTEC_SDK_VERSION:-4.0.0-devnet.2-patch.4}"
AZTEC_SDK_NPM_TAG_TESTNET="${AZTEC_SDK_NPM_TAG_TESTNET:-rc}"
AZTEC_NODE_URL_DEVNET="${AZTEC_NODE_URL_DEVNET:-https://v4-devnet-2.aztec-labs.com/}"
AZTEC_NODE_URL_TESTNET="${AZTEC_NODE_URL_TESTNET:-https://rpc.testnet.aztec-labs.com}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

if [ "$_network" = "testnet" ]; then
  _npm_tag="$AZTEC_SDK_NPM_TAG_TESTNET"
  _default_node_url="$AZTEC_NODE_URL_TESTNET"
  _current_ver="$(_pkg_ver "@aztec/aztec.js")"
  _needs_install=0
  [ "$_current_ver" = "$AZTEC_SDK_VERSION" ] && _needs_install=1
  [ -z "$_current_ver" ] && _needs_install=1
else
  _npm_tag="devnet"
  _default_node_url="$AZTEC_NODE_URL_DEVNET"
  _needs_install=0
  [ "$(_pkg_ver "@aztec/aztec.js")" != "$AZTEC_SDK_VERSION" ] && _needs_install=1
  [ "$(_pkg_ver "@aztec/stdlib")"   != "$AZTEC_SDK_VERSION" ] && _needs_install=1
fi

if [ "$_needs_install" = "1" ]; then
  [ ! -f package.json ] && printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec 2>/dev/null || true
  npm install --no-package-lock "@aztec/aztec.js@$_npm_tag" "@aztec/stdlib@$_npm_tag" --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$_npm_tag)"
  wait $_npm_pid
fi

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" \
  -o ~/.aztec-devtools/check-fee-juice-balance.mjs 2>/dev/null

# Pass --node if no custom node was provided
if [ "$_has_custom_node" = "0" ]; then
  _extra_args="--node $_default_node_url"
else
  _extra_args=""
fi

_out=$(mktemp)
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@" $_extra_args > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching balance from Aztec $_network"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
