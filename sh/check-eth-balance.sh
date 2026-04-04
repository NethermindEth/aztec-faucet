#!/bin/sh
# Checks the Sepolia ETH balance of an Ethereum address.
# Requires a Sepolia RPC URL (Alchemy, Infura, etc.)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS \
#     --rpc https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#
# Or set L1_RPC_URL in your environment and omit --rpc:
#   export L1_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
#   curl -fsSL https://raw.githubusercontent.com/NethermindEth/aztec-faucet/main/sh/check-eth-balance.sh | sh -s -- \
#     --address 0xYOUR_ETH_ADDRESS

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

printf '\n  Sepolia ETH Balance Checker\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

_pkgs=""
[ ! -d node_modules/viem ] && _pkgs="$_pkgs viem"

if [ -n "$_pkgs" ]; then
  [ ! -f package.json ] && printf '{"type":"module"}' > package.json
  npm install --no-package-lock --no-audit $_pkgs --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages" || exit 1
fi

curl -fsSL "$REPO_RAW/scripts/check-eth-balance.mjs" \
  -o ~/.aztec-devtools/check-eth-balance.mjs 2>/dev/null

_out=$(mktemp)
node ~/.aztec-devtools/check-eth-balance.mjs "$@" < /dev/null > "$_out" 2>&1 &
_node_pid=$!
spin $_node_pid "Fetching ETH balance from Sepolia"
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
