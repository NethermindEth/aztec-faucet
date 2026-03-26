#!/bin/sh
# Checks the Fee Juice balance of an Aztec address on devnet.
# Fee Juice is stored in public state, so no wallet or private key is needed.
#
# Usage (copy from the faucet UI — address is pre-filled):
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/devnet/check-balance.sh | sh -s -- \
#     --address <pre-filled>
#
# Against a custom node:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/devnet/check-balance.sh | sh -s -- \
#     --address 0xYOUR_ADDRESS \
#     --node https://your-node-url

set -e

REPO_BRANCH="main"
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

# Detect if caller passed --node (custom node override)
_has_custom_node=0
_prev=""
for _arg in "$@"; do
  if [ "$_prev" = "--node" ]; then
    _has_custom_node=1
  fi
  _prev="$_arg"
done

printf '\n  Aztec Fee Juice Balance Checker (devnet)\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_VERSION="${AZTEC_SDK_VERSION:-4.0.0-devnet.2-patch.4}"
AZTEC_NODE_URL_DEVNET="${AZTEC_NODE_URL_DEVNET:-https://v4-devnet-2.aztec-labs.com/}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

_needs_install=0
[ "$(_pkg_ver "@aztec/aztec.js")" != "$AZTEC_SDK_VERSION" ] && _needs_install=1
[ "$(_pkg_ver "@aztec/stdlib")"   != "$AZTEC_SDK_VERSION" ] && _needs_install=1

if [ "$_needs_install" = "1" ]; then
  [ ! -f package.json ] && printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec 2>/dev/null || true
  npm install --no-package-lock --no-audit "@aztec/aztec.js@devnet" "@aztec/stdlib@devnet" --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@devnet)" || exit 1
fi

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" \
  -o ~/.aztec-devtools/check-fee-juice-balance.mjs 2>/dev/null

if [ "$_has_custom_node" = "0" ]; then
  _extra_args="--node $AZTEC_NODE_URL_DEVNET"
else
  _extra_args=""
fi

_out=$(mktemp)
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@" $_extra_args > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching balance from Aztec devnet"
_code=$?
sed "s/.*$(printf '\r')//" "$_out"
rm -f "$_out"
exit $_code
