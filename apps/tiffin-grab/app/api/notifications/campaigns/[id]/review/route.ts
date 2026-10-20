import { handler, json, problem } from "@foundry/routes";
import { reviewCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = async () => !!(await campaignConfig());

/** What the Review step shows; the send and schedule routes enforce the same checklist. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const review = await reviewCampaign(deps, id, { footerConfigured: await footerConfigured() });
    return review ? json(review) : problem(404, "Campaign not found");
  },
);
