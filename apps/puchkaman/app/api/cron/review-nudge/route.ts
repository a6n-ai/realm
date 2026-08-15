import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { getGoogleReviewsConfig } from "@realm/google-reviews";
import { db } from "@/db/client";
import { orders, reviewNudges } from "@/db/schema";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { dispatchReviewNudge } from "@/lib/services/review-nudge-dispatch";

// Scheduler-agnostic protected route, same fail-closed contract as tiffin-grab's
// review-nudge / optimoroute-sync crons.
export const dynamic = "force-dynamic";

// Give the customer time to actually receive and eat the order before asking for a
// review — hooking the "paid" transition itself would ask seconds after checkout.
const NUDGE_DELAY_MS = 24 * 60 * 60 * 1000;

/** Customers with a paid order at least a day old and no nudge yet. */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fail closed: no configured secret, or a mismatched bearer → 401.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  if (!cfg.installed || !cfg.placeId) {
    return Response.json({ skipped: "plugin not configured" }, { status: 503 });
  }

  const cutoff = Date.now() - NUDGE_DELAY_MS;

  // Nudges key off orders.customerEmail, not the owner row: most checkouts are still
  // guest, and a customer who later signs in must not be nudged twice.
  // This join is raw-case against orders.customerEmail, not lower(). Harmless: a
  // mixed-case address can miss the reviewNudges prefilter here, but dispatchReviewNudge
  // re-checks shouldNudge, which normalizes email before reading the store.
  const candidates = await db
    .selectDistinct({ email: orders.customerEmail, name: orders.customerName })
    .from(orders)
    .leftJoin(reviewNudges, eq(reviewNudges.email, orders.customerEmail))
    .where(
      and(
        // "fulfilled" is a later stage of the same delivered order — nothing writes it
        // today, but the day something does, those are exactly the customers who
        // received food and should still be nudged.
        inArray(orders.status, ["paid", "fulfilled"]),
        lt(orders.paidAt, cutoff),
        isNull(reviewNudges.email),
      ),
    )
    // ponytail: capped batch, add a cursor if the backlog ever exceeds one run
    .limit(200);

  for (const c of candidates) {
    await dispatchReviewNudge({ email: c.email, name: c.name });
  }

  return Response.json({ candidates: candidates.length });
}

export const GET = handle;
export const POST = handle;
