import { readJson } from "@foundry/commons/util/http";
import { z } from "zod";
import { problem } from "@foundry/routes";
import { sendCampaign } from "@relay/engine";
import { staleGroupsForCampaign } from "@/lib/customer-groups/customer-groups.service";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { footerConfigured } from "@/lib/notifications/campaign-config";
import { campaignDeps } from "@/lib/notifications/deps";
const schema = z.object({ confirmedCount: z.number().int().nonnegative() });

export const POST = adminIdRoute(
  async (req, id) => {
    const parsed = await readJson(req, schema);
    if (!parsed.success) return problem(400, "Confirm the recipient count before sending");
    const stale = await staleGroupsForCampaign(id);
    if (stale.length) return problem(409, `Customer group list could not be refreshed (${stale.join(", ")}). Try again before sending.`);
    const result = await sendCampaign(campaignDeps, id, parsed.data.confirmedCount, { footerConfigured: await footerConfigured() });
    if ("error" in result) {
      const items = result.blocking?.length ? `: ${result.blocking.map((b) => b.message).join(" ")}` : "";
      return problem(result.status, `${result.error}${items}`);
    }
    return result;
  },
  { signal: () => true },
);
