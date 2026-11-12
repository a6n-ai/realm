import { handler, json, problem } from "@foundry/routes";
import { reviewCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { campaignDeps } from "@/lib/notifications/deps";
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = async () => !!(await campaignConfig());

/** What the Review step shows; the send and schedule routes enforce the same checklist. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const review = await reviewCampaign(campaignDeps, id, { footerConfigured: await footerConfigured() });
    return review ? json(review) : problem(404, "Campaign not found");
  },
);
