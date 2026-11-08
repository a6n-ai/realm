import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/runtime/env";

type Handler = (request: Request) => Promise<Response>;

function bearerMatches(authorization: string | null, secret: string): boolean {
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authorization ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Fail closed: no CRON_SECRET configured, or a mismatched bearer, is a 401. Every route under /api/cron (exempt in proxy.ts) must be wrapped. */
export function withCronAuth(handler: Handler): Handler {
  return async (request) => {
    const secret = cronSecret();
    if (!secret || !bearerMatches(request.headers.get("authorization"), secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request);
  };
}
