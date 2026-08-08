import { and, eq, isNull, lt } from "drizzle-orm";
import {
  getGoogleReviewsConfig,
  renderReviewNudgeEmail,
  shouldNudge,
} from "@realm/google-reviews";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { deliveries, orders, reviewNudges, users } from "@/db/schema";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("review-nudge-cron");

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

  const today = new Date().toISOString().slice(0, 10);

  // deliveries has no userId — it hangs off orders, and orders.userId is nullable
  // (guest/legacy rows), so candidates without a joined user are dropped below.
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
      ),
    )
    // ponytail: capped batch, add a cursor if the backlog ever exceeds one run
    .limit(200);

  let sent = 0;
  for (const c of candidates) {
    if (!c.email) continue;
    if (!shouldNudge(await reviewNudgeStore.get(c.email))) continue;
    try {
      const mail = await renderReviewNudgeEmail({
        businessName: "Tiffin Grab",
        customerName: c.name ?? undefined,
        placeId: cfg.placeId,
      });
      // Claim first: an upsert before send means a crash mid-send cannot produce
      // a second email later. One missed nudge beats nagging a customer twice.
      await reviewNudgeStore.markSent(c.email);
      await getEmailProvider().send({
        to: { email: c.email, name: c.name?.trim() || undefined },
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      sent += 1;
    } catch (err) {
      log.error({ err, email: c.email }, "review nudge send failed");
    }
  }

  return Response.json({ candidates: candidates.length, sent });
}

export const GET = handle;
export const POST = handle;
