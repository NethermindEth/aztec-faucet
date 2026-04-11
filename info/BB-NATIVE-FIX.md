# bb.js Native Binary Fix Tracker

## Problem
`@aztec/bb.js@4.1.2-rc.1` native binary requires GLIBC 2.39.
When running in a container with lower GLIBC, keygen fails with:
`"Native backend process exited with code 1"`

Status and drip endpoints may also fail if they trigger Barretenberg initialization.

## Root Cause
The `bb` binary at `node_modules/@aztec/bb.js/build/amd64-linux/bb` is compiled
against GLIBC 2.39. Confirmed via `strings bb | grep GLIBC_2. | sort -V | tail -1`.

The old devnet SDK (`@aztec/bb.js@4.0.0-devnet.2-patch.4`) worked because its
binary was compiled against GLIBC 2.36 or lower.

## Why production (main) works
Main branch uses `@aztec/accounts@4.0.0-devnet.2-patch.4` for keygen crypto ops
(even for testnet, just swaps in the testnet class ID). That old bb.js binary
works fine in `node:24-slim` (GLIBC 2.36).

---

## Attempts

### Attempt 1: Polyfill `globalThis.self` (instrumentation.ts)
- **What**: Set `globalThis.self = globalThis` before any @aztec code loads
- **Theory**: Makes `IS_BROWSER=true`, routes through BarretenbergSync (no WASM workers)
- **Result**: Status endpoint worked. Keygen still failed with "Native backend process exited with code 1" because BarretenbergSync ALSO tries the native binary first before falling back to WASM.
- **Verdict**: PARTIAL FIX. Prevents WASM worker crash but doesn't fix native binary GLIBC mismatch.

### Attempt 2: HARDWARE_CONCURRENCY=1 (Dockerfile env var)
- **What**: `ENV HARDWARE_CONCURRENCY=1` in Dockerfile runner stage
- **Theory**: Forces single-thread WASM, bypasses native binary
- **Result**: NOT YET TESTED with 4.1.2-rc.1 in isolation (was combined with self polyfill)
- **Verdict**: WORKAROUND. Forces WASM fallback, loses native binary performance.

### Attempt 3: Bun runtime (Dockerfile.bun)
- **What**: Replace `node server.js` with `bun server.js` in runner stage
- **Theory**: Bun defines `typeof self === 'object'`, making IS_BROWSER=true
- **Result**: Pod went into CrashLoopBackOff. Bun can't run Next.js standalone server.js.
- **Verdict**: FAILED. Bun is incompatible with Next.js standalone output.

### Attempt 4: Ubuntu 24.04 base image -- SUCCESS
- **What**: Replace `node:24-slim` (GLIBC 2.36) with `ubuntu:24.04` + Node.js 24 (GLIBC 2.39)
- **Theory**: Native bb binary works with correct GLIBC. No workarounds needed.
- **Commit**: `631408d`
- **Result**: ALL ENDPOINTS WORK on dev deployment (2026-04-10)
  - Keygen: 200 OK (testnet address generated)
  - Status: 200 OK (healthy, testnet RPC, SDK 4.1.2-rc.1)
  - Drip fee-juice: 200 OK (claimId returned)
- **Verdict**: SUCCESS. No workarounds needed (no self polyfill, no HARDWARE_CONCURRENCY).

---

## What to test after deployment
```bash
BASE="https://aztec-faucet.dev-nethermind.xyz"

# 1. Keygen (triggers BarretenbergSync via deriveKeys)
curl -sS "$BASE/api/keygen"

# 2. Status (triggers FaucetManager init)
curl -sS "$BASE/api/status"

# 3. Drip fee-juice
curl -sS -X POST "$BASE/api/drip" \
  -H "Content-Type: application/json" \
  -d '{"address":"<from keygen>","asset":"fee-juice"}'

# 4. Drip ETH
curl -sS -X POST "$BASE/api/drip" \
  -H "Content-Type: application/json" \
  -d '{"address":"0x2C9F64Bf28F858A914Be93Bc3Bd791CDbAD80B03","asset":"eth"}'
```

## Resolution
Ubuntu 24.04 base image provides GLIBC 2.39, which is what the @aztec/bb.js
native binary requires. No application-level workarounds needed. The native
binary runs directly, giving better performance than WASM fallback.

Key lesson: always match the container GLIBC version to the bb.js binary
requirements. Check with `strings node_modules/@aztec/bb.js/build/amd64-linux/bb | grep GLIBC_2. | sort -V | tail -1`.
