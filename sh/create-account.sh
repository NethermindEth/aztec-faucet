#!/bin/sh
# Derives a new Aztec account address (or an existing one from a secret key).
# Nothing is deployed — just prints your secret key and address.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/create-account.sh | sh
#
# With an existing secret key:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/aztec-faucet/main/sh/create-account.sh | sh -s -- --secret 0xYOUR_SECRET

set -e

REPO_RAW="https://raw.githubusercontent.com/Giri-Aayush/aztec-faucet/main"

mkdir -p ~/.aztec-devtools
cd ~/.aztec-devtools
echo '{"type":"module"}' > package.json
npm install --no-package-lock @aztec/wallets@devnet @aztec/aztec.js@devnet --silent

curl -fsSL "$REPO_RAW/scripts/create-aztec-account.mjs" -o ~/.aztec-devtools/create-aztec-account.mjs
node ~/.aztec-devtools/create-aztec-account.mjs "$@"
