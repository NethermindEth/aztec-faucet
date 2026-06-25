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

// Walk err + err.cause/nested fields into one lowercase blob; wallet SDKs wrap
// the real error inside generic outer messages, so we substring-match the chain.
export function flattenError(err: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (err == null || depth > 6 || seen.has(err)) return "";
  seen.add(err);
  const parts: string[] = [];
  if (typeof err === "string") parts.push(err);
  else if (err instanceof Error) {
    parts.push(err.message, err.name);
    if ("cause" in err) parts.push(flattenError((err as Error & { cause?: unknown }).cause, depth + 1, seen));
  } else if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    for (const k of ["message", "error", "details", "data"]) {
      if (typeof e[k] === "string") parts.push(e[k] as string);
    }
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
