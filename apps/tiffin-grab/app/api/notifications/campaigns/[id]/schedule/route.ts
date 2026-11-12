import { readBody } from "@foundry/commons/util/http";
import { handler, json, problem } from "@foundry/routes";
import { scheduleCampaign, zonedLocalToEpoch } from "@relay/engine";
import { staleGroupsForCampaign } from "@/lib/services/customer-groups.service";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { scheduleCampaignWake } from "@/lib/runtime/workflow-wake";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { campaignDeps } from "@/lib/notifications/deps";
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = async () => !!(await campaignConfig());

/** `{ localDateTime: "YYYY-MM-DDTHH:mm" | null }` in the app-settings timezone; null unschedules. */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readBody<{ localDateTime?: unknown } | null>(req);
    let scheduledAt: number | null = null;
    if (body?.localDateTime != null) {
      const { timezone } = await getAppSettings();
      scheduledAt = zonedLocalToEpoch(String(body.localDateTime), timezone);
      if (scheduledAt === null) return problem(400, "Pick a date and time");
    }
    if (scheduledAt !== null) {
    const stale = await staleGroupsForCampaign(id);
    if (stale.length) return problem(409, `Customer group list could not be refreshed (${stale.join(", ")}). Try again before sending.`);
    }
    const result = await scheduleCampaign(campaignDeps, id, scheduledAt, { footerConfigured: await footerConfigured() });
    if ("error" in result) {
      const items = result.blocking?.length ? `: ${result.blocking.map((b) => b.message).join(" ")}` : "";
      return problem(result.status, `${result.error}${items}`);
    }
    if (result.scheduledAt) await scheduleCampaignWake(result.scheduledAt);
    return json(result);
  },
);
