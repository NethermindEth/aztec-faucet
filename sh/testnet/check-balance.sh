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

printf '\n  Aztec Fee Juice Balance Checker (testnet)\n\n'

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools

# Load shared version config (always fetch fresh so version bumps propagate)
curl -fsSL "$REPO_RAW/sh/versions.sh" -o .versions.sh 2>/dev/null || true
[ -f .versions.sh ] && . ./.versions.sh
AZTEC_SDK_NPM_TAG="${AZTEC_SDK_NPM_TAG:-rc}"
AZTEC_NODE_URL="${AZTEC_NODE_URL:-https://rpc.testnet.aztec-labs.com}"

# Print installed version of a package, empty string if missing or unreadable
_pkg_ver() { node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){}" 2>/dev/null; }

# Print the version that the registry's tag currently points at.
# Cached for 6h.
_remote_pkg_ver() {
  local _pkg="$1" _tag="$2"
  local _safe_pkg
  _safe_pkg=$(printf '%s' "$_pkg" | tr '/' '-')
  local _cache="$HOME/.aztec-devtools/.tag-${_safe_pkg}-${_tag}.txt"
  if [ ! -f "$_cache" ] || [ "$(find "$_cache" -mmin +360 2>/dev/null)" ]; then
    npm view "${_pkg}@${_tag}" version 2>/dev/null > "$_cache" || true
  fi
  cat "$_cache" 2>/dev/null | tr -d '[:space:]'
}

# Testnet packages are installed as @aztec-rc/* aliases.
# Check every package the script installs, not just one. A previous tool
# (e.g. create-account.sh) may have populated aztec.js at the right version
# without installing stdlib, in which case a drift check on aztec.js alone
# would skip the install and check-fee-juice-balance.mjs would crash on the
# stdlib import.
_needs_install=0
_aztec_ver="$(_pkg_ver "@aztec-rc/aztec.js")"
_stdlib_ver="$(_pkg_ver "@aztec-rc/stdlib")"
if [ -z "$_aztec_ver" ] || [ -z "$_stdlib_ver" ]; then
  _needs_install=1
else
  _expected_ver="$(_remote_pkg_ver "@aztec/aztec.js" "$AZTEC_SDK_NPM_TAG")"
  if [ -n "$_expected_ver" ] && [ "$_aztec_ver" != "$_expected_ver" ]; then
    _needs_install=1
  fi
fi

if [ "$_needs_install" = "1" ]; then
  printf '{"type":"module"}' > package.json
  rm -rf node_modules/@aztec-rc 2>/dev/null || true
  npm install --no-package-lock --no-audit \
    "@aztec-rc/aztec.js@npm:@aztec/aztec.js@$AZTEC_SDK_NPM_TAG" \
    "@aztec-rc/stdlib@npm:@aztec/stdlib@$AZTEC_SDK_NPM_TAG" \
    --silent > /dev/null 2>&1 &
  _npm_pid=$!
  spin $_npm_pid "Installing packages (@$AZTEC_SDK_NPM_TAG)" || exit 1
fi

curl -fsSL "$REPO_RAW/scripts/check-fee-juice-balance.mjs" \
  -o ~/.aztec-devtools/check-fee-juice-balance.mjs 2>/dev/null || true

if [ "$_has_custom_node" = "0" ]; then
  _extra_args="--node $AZTEC_NODE_URL"
else
  _extra_args=""
fi

_out=$(mktemp)
node ~/.aztec-devtools/check-fee-juice-balance.mjs "$@" --network testnet $_extra_args < /dev/null > "$_out" 2>&1 &
_node_pid=$!
set +e
spin $_node_pid "Fetching balance from Aztec testnet"
_code=$?
set -e
if [ "$_code" = "0" ]; then
  sed "s/.*$(printf '\r')//" "$_out" | grep -v "MaxListenersExceededWarning\|Use emitter.setMaxListeners\|--trace-warnings"
else
  # Try to extract just "Error:" lines; if none, fall back to the full output
  # so non-error messages (e.g. the .mjs usage banner when --address is
  # missing) are still visible instead of leaving the user with just ✗.
  _err=$(grep -a "Error:" "$_out" | sed "s/.*$(printf '\r')//;s/$(printf '\033')\[[0-9;]*m//g")
  if [ -n "$_err" ]; then
    printf '\n%s\n\n' "$_err"
  else
    sed "s/.*$(printf '\r')//;s/$(printf '\033')\[[0-9;]*m//g" "$_out" | grep -v "MaxListenersExceededWarning\|Use emitter.setMaxListeners\|--trace-warnings"
  fi
fi
rm -f "$_out"
exit $_code
