import { readJson } from "@foundry/commons/util/http";
import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { sendCampaign } from "@relay/engine";
import { staleGroupsForCampaign } from "@/lib/customer-groups/customer-groups.service";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { signalOutbox } from "@/lib/notifications/outbox-signal";
import { campaignDeps } from "@/lib/notifications/deps";
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = async () => !!(await campaignConfig());
const schema = z.object({ confirmedCount: z.number().int().nonnegative() });

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = await readJson(req, schema);
    if (!parsed.success) return problem(400, "Confirm the recipient count before sending");
    const stale = await staleGroupsForCampaign(id);
    if (stale.length) return problem(409, `Customer group list could not be refreshed (${stale.join(", ")}). Try again before sending.`);
    const result = await sendCampaign(campaignDeps, id, parsed.data.confirmedCount, { footerConfigured: await footerConfigured() });
    if ("error" in result) {
      const items = result.blocking?.length ? `: ${result.blocking.map((b) => b.message).join(" ")}` : "";
      return problem(result.status, `${result.error}${items}`);
    }
    await signalOutbox();
    return json(result);
  },
);
