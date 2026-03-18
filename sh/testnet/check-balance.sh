#!/bin/sh
# Checks the Fee Juice balance of an Aztec address on testnet.
# Fee Juice is stored in public state, so no wallet or private key is needed.
#
# Usage (copy from the faucet UI — address is pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/testnet/check-balance.sh | sh -s -- \
#     --address <pre-filled>
#
# Against a custom node:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/testnet/check-balance.sh | sh -s -- \
#     --address 0xYOUR_ADDRESS \
#     --node https://your-node-url

set -e

REPO_BRANCH="main"
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

# Detect if caller passed --node (custom node override)
_has_custom_node=0
_prev=""
for _arg in "$@"; do
  if [ "$_prev" = "--node" ]; then
    _has_custom_node=1
  fi
  _prev="$_arg"
done

printf '\n  Aztec Fee Juice Balance Checker (testnet)\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_NPM_TAG_TESTNET="${AZTEC_SDK_NPM_TAG_TESTNET:-rc}"
AZTEC_NODE_URL_TESTNET="${AZTEC_NODE_URL_TESTNET:-https://rpc.testnet.aztec-labs.com}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

# Testnet packages are installed as @aztec-rc/* aliases
_needs_install=0
[ -z "$(_pkg_ver "@aztec-rc/aztec.js")" ] && _needs_install=1

if [ "$_needs_install" = "1" ]; then
  [ ! -f package.json ] && printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec-rc 2>/dev/null || true
  npm install --no-package-lock \
    "@aztec-rc/aztec.js@npm:@aztec/aztec.js@$AZTEC_SDK_NPM_TAG_TESTNET" \
    "@aztec-rc/stdlib@npm:@aztec/stdlib@$AZTEC_SDK_NPM_TAG_TESTNET" \
    --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$AZTEC_SDK_NPM_TAG_TESTNET)"
  wait $_npm_pid
fi

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" \
  -o ~/.aztec-devtools/check-fee-juice-balance.mjs 2>/dev/null

if [ "$_has_custom_node" = "0" ]; then
  _extra_args="--node $AZTEC_NODE_URL_TESTNET"
else
  _extra_args=""
fi

_out=$(mktemp)
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@" --network testnet $_extra_args > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching balance from Aztec testnet"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
