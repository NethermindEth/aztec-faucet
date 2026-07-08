// Shared classification for Aztec wallet/SDK errors. The SDK exposes no
// structured rejection code: the iframe wallet rejects with
// new Error(jsonStringify(error)), so the wallet-side text is all we get.

// Thrown when the user declines a wallet popup (connect permission or a tx), so
// callers can show "you cancelled" instead of a raw SDK string or a "no account".
export class WalletUserRejectedError extends Error {
  constructor(cause?: unknown) {
    super("Wallet request rejected by user", cause !== undefined ? { cause } : undefined);
    this.name = "WalletUserRejectedError";
  }
}

// Wallet link dropped mid-flow (extension closed / session lost).
export class WalletDisconnectedError extends Error {
  constructor(cause?: unknown) {
    super("Wallet disconnected", cause !== undefined ? { cause } : undefined);
    this.name = "WalletDisconnectedError";
  }
}

// Walk err + err.cause/nested fields into one lowercase blob; wallet SDKs wrap
// the real error inside generic outer messages, so we substring-match the chain.
export function flattenError(err: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (err == null || depth > 6 || seen.has(err)) return "";
  seen.add(err);
  const parts: string[] = [];
  if (typeof err === "string") parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message, err.name);
    const code = (err as Error & { code?: unknown }).code;
    if (typeof code === "number" || typeof code === "string") parts.push(String(code));
    if ("cause" in err) parts.push(flattenError((err as Error & { cause?: unknown }).cause, depth + 1, seen));
  } else if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    for (const k of ["message", "error", "details", "data"]) {
      if (typeof e[k] === "string") parts.push(e[k] as string);
    }
    if (typeof e.code === "number" || typeof e.code === "string") parts.push(String(e.code));
    if (e.cause) parts.push(flattenError(e.cause, depth + 1, seen));
  } else {
    parts.push(String(err));
  }
  return parts.join(" ").toLowerCase();
}

// True when the error chain shows the user dismissed a wallet popup. Only
// user-qualified phrases match, so transport/relay errors ("connection refused",
// "permission denied", "request rejected by server", "transaction declined") do
// NOT trip it: a false positive here hides a real failure behind "you cancelled".
export function isUserRejection(err: unknown): boolean {
  if (err instanceof WalletUserRejectedError) return true;
  const blob = flattenError(err);
  return (
    blob.includes("user denied") ||
    blob.includes("user rejected") ||
    blob.includes("user cancel") ||
    blob.includes("denied by user") ||
    blob.includes("rejected by user")
  );
}

// SDK drop strings: "Wallet disconnected" (in-flight) / "Wallet has been disconnected".
export function isWalletDisconnected(err: unknown): boolean {
  if (err instanceof WalletDisconnectedError) return true;
  const blob = flattenError(err);
  return blob.includes("wallet disconnected") || blob.includes("wallet has been disconnected");
}

// Stale wallet SDK on an incompatible rollup version, or calling RPC v5 removed.
export class WalletVersionMismatchError extends Error {
  constructor(cause?: unknown) {
    super("Wallet on an incompatible network version", cause !== undefined ? { cause } : undefined);
    this.name = "WalletVersionMismatchError";
  }
}

// #56 signatures: removed RPC (node_getBlockHeader / JSON-RPC method not found) or a rollup-version mismatch.
export function isWalletVersionMismatch(err: unknown): boolean {
  if (err instanceof WalletVersionMismatchError) return true;
  const blob = flattenError(err);
  return (
    blob.includes("node_getblockheader") ||
    blob.includes("method not found") ||
    blob.includes("-32601") ||
    (blob.includes("rollup") && (blob.includes("version") || blob.includes("mismatch")))
  );
}

// Wallet connected but refused the tx/simulation capability the claim needs.
export class WalletCapabilityDeniedError extends Error {
  constructor(cause?: unknown) {
    super("Wallet did not grant transaction permission", cause !== undefined ? { cause } : undefined);
    this.name = "WalletCapabilityDeniedError";
  }
}

// Provisional marker set; confirm the real Azguard capability-denial string on the extension test.
export function isCapabilityDenied(err: unknown): boolean {
  if (err instanceof WalletCapabilityDeniedError) return true;
  const blob = flattenError(err);
  return (
    blob.includes("capability") &&
    (blob.includes("not granted") || blob.includes("denied") || blob.includes("missing") || blob.includes("required"))
  );
}
