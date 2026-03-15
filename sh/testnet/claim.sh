#!/bin/sh
# Claims bridged Fee Juice on Aztec testnet L2.
# Auto-detects if your account is deployed:
#   - Not deployed: deploys + claims in one atomic tx (Fee Juice pays for itself)
#   - Already deployed: calls FeeJuice.claim() directly
#
# The faucet UI pre-fills --claim-amount, --claim-secret, and --message-leaf-index.
# You only need to supply your --secret key.
#
# Usage (copy from the faucet UI — values are pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/testnet/claim.sh | sh -s -- \
#     --secret <YOUR_SECRET_KEY> \
#     --claim-amount <pre-filled> \
#     --claim-secret <pre-filled> \
#     --message-leaf-index <pre-filled>

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

printf '\n  Aztec Fee Juice Claim (testnet)\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_NPM_TAG_TESTNET="${AZTEC_SDK_NPM_TAG_TESTNET:-rc}"
AZTEC_NODE_URL_TESTNET="${AZTEC_NODE_URL_TESTNET:-https://rpc.testnet.aztec-labs.com}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

# Testnet packages are installed as @aztec-rc/* aliases so claim-fee-juice.mjs
# can import them from that scope without conflicting with devnet @aztec/* packages
_needs_install=0
[ -z "$(_pkg_ver "@aztec-rc/wallets")" ] && _needs_install=1

if [ "$_needs_install" = "1" ]; then
  printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec-rc 2>/dev/null || true
  npm install --no-package-lock \
    "@aztec-rc/wallets@npm:@aztec/wallets@$AZTEC_SDK_NPM_TAG_TESTNET" \
    "@aztec-rc/aztec.js@npm:@aztec/aztec.js@$AZTEC_SDK_NPM_TAG_TESTNET" \
    "@aztec-rc/stdlib@npm:@aztec/stdlib@$AZTEC_SDK_NPM_TAG_TESTNET" \
    --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$AZTEC_SDK_NPM_TAG_TESTNET)"
  wait $_npm_pid
fi

curl -fsSL "$REPO_RAW/scripts/claim-fee-juice.mjs" \
  -o ~/.aztec-devtools/claim-fee-juice.mjs 2>/dev/null || true

_out=$(mktemp)
node ~/.aztec-devtools/claim-fee-juice.mjs "$@" --network testnet --node-url "$AZTEC_NODE_URL_TESTNET" > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Claiming Fee Juice on Aztec testnet (this may take 1-2 min)"
wait $_node_pid && _code=0 || _code=$?
cat "$_out"
rm -f "$_out"
exit $_code
