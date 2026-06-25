// Case- and whitespace-insensitive address compare, shared across bar/form/claim.

export function normalizeAddr(a: string | null | undefined): string {
  return (a ?? "").trim().toLowerCase();
}

export function addressesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normalizeAddr(a) === normalizeAddr(b);
}
