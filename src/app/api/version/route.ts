import { NextResponse } from "next/server";
import { CORS_HEADERS_GET } from "@/lib/cors";

// Build provenance is injected via Docker build args (see Dockerfile runner
// stage and .github/workflows/push-jfrog.yaml). Defaults make local `npm run
// dev` and unbuilt environments return "unknown" instead of throwing.
export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.GIT_SHA || "unknown",
      branch: process.env.GIT_BRANCH || "unknown",
      builtAt: process.env.BUILT_AT || "unknown",
    },
    { headers: CORS_HEADERS_GET },
  );
}
