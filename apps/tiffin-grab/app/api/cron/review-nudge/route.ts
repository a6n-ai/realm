import { and, eq, isNull, lt } from "drizzle-orm";
import { dispatchReviewNudge, getGoogleReviewsConfig } from "@foundry/google-reviews";
import { db } from "@/db/client";
import { deliveries, orders, reviewNudges, users } from "@/db/schema";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getEmailProvider } from "@/lib/email/provider";

// Scheduler-agnostic protected route, same fail-closed contract as optimoroute-sync.
export const dynamic = "force-dynamic";

/** Customers with at least one past-dated scheduled delivery and no nudge yet. */
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

  // Signs the CASL-required unsubscribe link — reuses BETTER_AUTH_SECRET (the
  // app's one server signing secret) rather than adding a second one just for this.
  const unsubscribeSecret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  if (!unsubscribeSecret || !baseUrl) {
    return Response.json({ error: "BETTER_AUTH_SECRET/BETTER_AUTH_URL not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // deliveries has no userId — it hangs off orders, and orders.userId is nullable
  // (guest/legacy rows), so candidates without a joined user are dropped below.
  // This join is raw-case against users.email, not lower(users.email) — a mixed-case
  // stored address can miss the reviewNudges prefilter here. Harmless: dispatchReviewNudge
  // re-checks shouldNudge, which normalizes email before reading the store, so a false
  // "not yet nudged" here still resolves correctly, just does one extra store read.
  const candidates = await db
    .selectDistinct({ email: users.email, name: users.name })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .leftJoin(reviewNudges, eq(reviewNudges.email, users.email))
    .where(
      and(
        eq(deliveries.status, "scheduled"),
        lt(deliveries.deliveryDate, today),
        isNull(reviewNudges.email),
        // Opted-out users are never mailed — same rule notifications/policy.ts
        // applies to the outbox (email defers to this flag with no pref row).
        eq(users.notifyEmail, true),
      ),
    )
    // ponytail: capped batch, add a cursor if the backlog ever exceeds one run
    .limit(200);

  for (const c of candidates) {
    if (!c.email) continue;
    await dispatchReviewNudge({
      email: c.email,
      name: c.name ?? undefined,
      businessName: "Tiffin Grab",
      configStore: integrationsConfigStore,
      nudgeStore: reviewNudgeStore,
      emailProvider: getEmailProvider(),
      unsubscribeSecret,
      baseUrl,
    });
  }

  return Response.json({ candidates: candidates.length });
}

export const GET = handle;
export const POST = handle;
