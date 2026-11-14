import { problem } from "@foundry/routes";
import { reviewCampaign } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { footerConfigured } from "@/lib/notifications/campaign-config";
import { campaignDeps } from "@/lib/notifications/deps";

/** What the Review step shows; the send and schedule routes enforce the same checklist. */
export const GET = adminIdRoute(async (_req, id) =>
    (await reviewCampaign(campaignDeps, id, { footerConfigured: await footerConfigured() })) ?? problem(404, "Campaign not found"));
