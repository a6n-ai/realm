import { readJson } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { createCampaign, createCampaignSchema, listCampaigns } from "@relay/engine";
import { adminRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";
const schema = createCampaignSchema(["email", "in_app", "sms", "whatsapp"]);

export const GET = adminRoute(() => listCampaigns(campaignDeps));

export const POST = adminRoute(async (req) => {
  const parsed = await readJson(req, schema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  // Always a draft: scheduling goes through /schedule, which runs the checklist and rejects past times.
  return createCampaign(campaignDeps, { ...parsed.data, scheduledAt: null });
});
