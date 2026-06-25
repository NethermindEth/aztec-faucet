// Case- and whitespace-insensitive address compare, shared by the wallet bar
// and the claim flow.

function normalizeAddr(a: string | null | undefined): string {
  return (a ?? "").trim().toLowerCase();
}

export function addressesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddr(a);
  return na.length > 0 && na === normalizeAddr(b);
}
