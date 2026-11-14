import { readJson } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { updateCampaignAudience, updateCampaignAudienceSchema } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const POST = adminIdRoute(async (req, id) => {
  const parsed = await readJson(req, updateCampaignAudienceSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return updateCampaignAudience(campaignDeps, id, parsed.data.audience);
});
