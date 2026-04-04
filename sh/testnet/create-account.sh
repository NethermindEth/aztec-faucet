#!/bin/sh
# Derives a new Aztec testnet account address (or an existing one from a secret key).
# Nothing is deployed — just prints your secret key and address.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/testnet/create-account.sh | sh
#
# With an existing secret key:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/testnet/create-account.sh | sh -s -- \
#     --secret 0xYOUR_SECRET

set -e

REPO_BRANCH="dev"
REPO_RAW="https://raw.githubusercontent.com/NethermindEth/aztec-faucet/$REPO_BRANCH"

# spin <pid> <message> — animated braille spinner; prints ✓ or ✗ on completion
spin() {
  _pid=$1 _msg=$2 _i=0 _s=$(date +%s)
  while kill -0 "$_pid" 2>/dev/null; do
    _i=$(( (_i + 1) % 10 ))
    case $_i in
      0) _c='⠋' ;; 1) _c='⠙' ;; 2) _c='⠹' ;; 3) _c='⠸' ;; 4) _c='⠼' ;;
      5) _c='⠴' ;; 6) _c='⠦' ;; 7) _c='⠧' ;; 8) _c='⠇' ;; *) _c='⠏' ;;
    esac
    _e=$(( $(date +%s) - _s ))
    printf '\r  \033[36m%s\033[0m  %s  \033[2m%ds\033[0m' "$_c" "$_msg" "$_e"
    sleep 0.1
  done
  wait "$_pid" 2>/dev/null && _ok=0 || _ok=$?
  _e=$(( $(date +%s) - _s ))
  if [ "$_ok" = "0" ]; then
    printf '\r\033[K  \033[32m✓\033[0m  %s  \033[2m%ds\033[0m\n' "$_msg" "$_e"
  else
    printf '\r\033[K  \033[31m✗\033[0m  %s\n' "$_msg"
  fi
  return "$_ok"
}

printf '\n  Aztec Account Generator (testnet)\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_NPM_TAG_TESTNET="${AZTEC_SDK_NPM_TAG_TESTNET:-rc}"
AZTEC_NODE_URL_TESTNET="${AZTEC_NODE_URL_TESTNET:-https://rpc.testnet.aztec-labs.com}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

# Testnet packages are installed as @aztec-rc/* aliases so create-aztec-account.mjs
# can import them from that scope without conflicting with devnet @aztec/* packages
_needs_install=0
[ -z "$(_pkg_ver "@aztec-rc/wallets")" ] && _needs_install=1

if [ "$_needs_install" = "1" ]; then
  printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec-rc 2>/dev/null || true
  npm install --no-package-lock --no-audit \
    "@aztec-rc/wallets@npm:@aztec/wallets@$AZTEC_SDK_NPM_TAG_TESTNET" \
    "@aztec-rc/aztec.js@npm:@aztec/aztec.js@$AZTEC_SDK_NPM_TAG_TESTNET" \
    --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$AZTEC_SDK_NPM_TAG_TESTNET)" || exit 1
fi

curl -fsSL "$REPO_RAW/scripts/create-aztec-account.mjs" \
  -o ~/.aztec-devtools/create-aztec-account.mjs 2>/dev/null || true

_out=$(mktemp)
node ~/.aztec-devtools/create-aztec-account.mjs "$@" --network testnet --node-url "$AZTEC_NODE_URL_TESTNET" < /dev/null > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Generating testnet account"
_code=$?
if [ "$_code" = "0" ]; then
  sed "s/.*$(printf '\r')//" "$_out" | grep -v "MaxListenersExceededWarning\|Use emitter.setMaxListeners\|--trace-warnings"
else
  _err=$(grep -a "Error:" "$_out" | sed "s/.*$(printf '\r')//;s/$(printf '\033')\[[0-9;]*m//g")
  if [ -n "$_err" ]; then
    printf '\n%s\n\n' "$_err"
  fi
fi
rm -f "$_out"
exit $_code
