import { and, eq, isNull, lt } from "drizzle-orm";
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

  // Puchkaman is guest checkout — no user row, so the email lives on the order itself.
  const candidates = await db
    .selectDistinct({ email: orders.customerEmail, name: orders.customerName })
    .from(orders)
    .leftJoin(reviewNudges, eq(reviewNudges.email, orders.customerEmail))
    .where(
      and(
        eq(orders.status, "paid"),
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
