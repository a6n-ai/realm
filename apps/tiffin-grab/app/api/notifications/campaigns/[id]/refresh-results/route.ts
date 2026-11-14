import { problem } from "@foundry/routes";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { refreshCampaignResults } from "@/lib/notifications/campaign-results";

export const POST = adminIdRoute(async (_req, id) => (await refreshCampaignResults(id)) ?? problem(404, "Campaign not found"));
