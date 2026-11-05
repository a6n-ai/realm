import { handler, json, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { refreshCampaignResults } from "@/lib/notifications/campaign-results";

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await refreshCampaignResults(id);
    if (!result) return problem(404, "Campaign not found");
    return json(result);
  },
);
