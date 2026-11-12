import { handler, json, problem } from "@foundry/routes";
import { completeCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await completeCampaign(campaignDeps, id);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
