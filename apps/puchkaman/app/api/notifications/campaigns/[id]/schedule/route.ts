import { handler, json, problem } from "@foundry/routes";
import { buildCampaignConfig, scheduleCampaign, zonedLocalToEpoch } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { addScheduledCampaign } from "@/lib/notifications/campaign-schedule";
import { app } from "@/db/schema";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = () => !!buildCampaignConfig(notificationTables, process.env, { senderName: "Puchkaman" });

/** `{ localDateTime: "YYYY-MM-DDTHH:mm" | null }` in the app-settings timezone; null unschedules. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    let scheduledAt: number | null = null;
    if (body?.localDateTime != null) {
      const [appRow] = await db.select({ timezone: app.timezone }).from(app).limit(1);
      scheduledAt = zonedLocalToEpoch(String(body.localDateTime), appRow?.timezone ?? "America/Toronto");
      if (scheduledAt === null) return problem(400, "Pick a date and time");
    }
    const result = await scheduleCampaign(deps, id, scheduledAt, { footerConfigured: footerConfigured() });
    if ("error" in result) {
      const items = result.blocking?.length ? `: ${result.blocking.map((b) => b.message).join(" ")}` : "";
      return problem(result.status, `${result.error}${items}`);
    }
    // A stale Redis entry after unscheduling is harmless: the drain reads status from the DB.
    if (result.scheduledAt) addScheduledCampaign(id, result.scheduledAt);
    return json(result);
  },
);
