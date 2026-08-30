import { z } from "zod";
import { clientIp, isRateLimited } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { resolveAndPersist } from "@realm/places";

const resolveSchema = z.object({
  placeId: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1),
});

// Fires once per pick, not per keystroke — tighter than suggest's 60/min.
const RESOLVE_LIMIT = 20;
const RESOLVE_WINDOW_MS = 60_000;

// Public (unauthenticated), always 200 — a throttled or empty result both
// degrade to "no coordinates yet", never a toast. AWS-only: this is the one
// path that persists a geocode, so it must never route through Google.
export const POST = handler(async (request: Request): Promise<Response> => {
  const ip = clientIp(request) ?? "unknown";
  if (isRateLimited(ip, RESOLVE_LIMIT, RESOLVE_WINDOW_MS, "address-resolve-ip")) {
    return json({ place: null });
  }

  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ place: null });

  const place = await resolveAndPersist(parsed.data, { region: process.env.AWS_REGION });
  return json({ place });
});
