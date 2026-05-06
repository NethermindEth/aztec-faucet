/**
 * CORS policy: GET endpoints are read-only public data and may be polled
 * from external tooling (dashboards, status pages, CLI scripts), so they
 * advertise an open CORS policy. The POST `/api/drip` endpoint is intentionally
 * same-origin only — drip requests must come from our own UI to make
 * drive-by abuse harder.
 */
export const CORS_HEADERS_GET = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
