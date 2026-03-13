#!/bin/sh
# Claims bridged Fee Juice on Aztec L2.
# Auto-detects if your account is deployed:
#   - Not deployed: deploys + claims in one atomic tx (Fee Juice pays for itself)
#   - Already deployed: calls FeeJuice.claim() directly
#
# The faucet UI pre-fills --claim-amount, --claim-secret, and --message-leaf-index.
# You only need to supply your --secret key.
#
# Usage (copy from the faucet UI — values are pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/claim.sh | sh -s -- \
#     --secret <YOUR_SECRET_KEY> \
#     --claim-amount <pre-filled> \
#     --claim-secret <pre-filled> \
#     --message-leaf-index <pre-filled> \
#     [--network testnet]

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

# Parse --network flag from args (pass all other args through to the mjs)
_network="devnet"
for _arg in "$@"; do
  if [ "$_arg" = "testnet" ] && [ "$_prev" = "--network" ]; then
    _network="testnet"
  fi
  _prev="$_arg"
done

printf '\n  Aztec Fee Juice Claim (%s)\n\n' "$_network"

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
  _node_url="$AZTEC_NODE_URL_TESTNET"
  # For testnet (@rc packages), reinstall if currently on the pinned devnet version
  _current_ver="$(_pkg_ver "@aztec/wallets")"
  _needs_install=0
  [ "$_current_ver" = "$AZTEC_SDK_VERSION" ] && _needs_install=1
  [ -z "$_current_ver" ] && _needs_install=1
else
  _npm_tag="devnet"
  _node_url="$AZTEC_NODE_URL_DEVNET"
  _needs_install=0
  [ "$(_pkg_ver "@aztec/wallets")"  != "$AZTEC_SDK_VERSION" ] && _needs_install=1
  [ "$(_pkg_ver "@aztec/aztec.js")" != "$AZTEC_SDK_VERSION" ] && _needs_install=1
  [ "$(_pkg_ver "@aztec/stdlib")"   != "$AZTEC_SDK_VERSION" ] && _needs_install=1
fi

if [ "$_needs_install" = "1" ]; then
  # Reset package.json to a clean slate so stale deps don't interfere with the install
  printf '{"type":"module"}' > package.json
  # Wipe existing @aztec packages to prevent version conflicts from prior installs
  rm -rf node_modules/@aztec 2>/dev/null || true
  npm install --no-package-lock "@aztec/wallets@$_npm_tag" "@aztec/aztec.js@$_npm_tag" "@aztec/stdlib@$_npm_tag" --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$_npm_tag)"
  wait $_npm_pid
fi

curl -fsSL "$REPO_RAW/scripts/claim-fee-juice.mjs" \
  -o ~/.aztec-devtools/claim-fee-juice.mjs 2>/dev/null || true

_out=$(mktemp)
node ~/.aztec-devtools/claim-fee-juice.mjs "$@" --node-url "$_node_url" > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Claiming Fee Juice on Aztec L2 (this may take 1-2 min)"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
