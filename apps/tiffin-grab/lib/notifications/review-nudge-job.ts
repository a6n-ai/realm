import { appTodayIso } from "@/lib/dates/today";
import { and, eq, isNull, lt } from "drizzle-orm";
import { dispatchReviewNudge, getGoogleReviewsConfig } from "@foundry/google-reviews";
import { db } from "@/db/client";
import { deliveries, orders, reviewNudges, users } from "@/db/schema";
import { appOrigin, authSecret } from "@/lib/runtime/env";
import { getAppSettings, integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/notifications/review-nudge.service";
import { renderEmailTemplate } from "@relay/email";
import { reviewNudgeEmailProvider } from "./review-nudge-provider";
import { BRAND_NAME } from "@/lib/brand";

/** Customers with at least one past-dated scheduled delivery and no nudge yet. */
export async function runReviewNudges(): Promise<Response> {
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  if (!cfg.installed || !cfg.placeId) {
    return Response.json({ skipped: "plugin not configured" }, { status: 503 });
  }

  // Signs the CASL-required unsubscribe link with the app's one server signing secret.
  const unsubscribeSecret = authSecret("review-nudge");
  const baseUrl = appOrigin();
  if (!unsubscribeSecret || !baseUrl) {
    return Response.json({ error: "BETTER_AUTH_SECRET/BETTER_AUTH_URL not configured" }, { status: 500 });
  }

  const today = appTodayIso((await getAppSettings()).timezone);

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
      businessName: BRAND_NAME,
      configStore: integrationsConfigStore,
      nudgeStore: reviewNudgeStore,
      emailProvider: reviewNudgeEmailProvider(),
      renderEmail: renderEmailTemplate,
      unsubscribeSecret,
      baseUrl,
    });
  }

  return Response.json({ candidates: candidates.length });
}
