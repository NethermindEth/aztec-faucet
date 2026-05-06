// Loose IP-shape check. We're not doing full RFC validation — just rejecting
// obviously malformed values that could only have come from header spoofing
// attempts. The real protection against XFF spoofing is the trusted ingress
// (AWS ALB / NGINX) which should overwrite or strip inbound XFF headers
// before they reach this handler. Verify ingress config before relying on
// this for rate-limiting integrity.
const IPV4_RE = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function looksLikeIp(s: string): boolean {
  return IPV4_RE.test(s) || (s.includes(":") && IPV6_RE.test(s));
}

/**
 * Extracts the client IP from `x-forwarded-for` (first hop) or `x-real-ip`,
 * after a basic shape check. Returns `undefined` if neither header is present
 * or both fail the shape check.
 *
 * SECURITY: This trusts the ingress to overwrite/strip the inbound XFF.
 * If your deployment terminates TLS at the application without a trusted
 * proxy in front, the client can spoof these headers and defeat rate limits.
 */
export function extractClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // XFF is a comma-separated chain. The first entry is the original client.
    const candidate = forwarded.split(",")[0]?.trim();
    if (candidate && looksLikeIp(candidate)) return candidate;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && looksLikeIp(realIp)) return realIp;
  return undefined;
}
