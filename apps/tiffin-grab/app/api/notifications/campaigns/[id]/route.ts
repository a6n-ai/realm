import { readBody } from "@foundry/commons/util/http";
import { handler, json, problem } from "@foundry/routes";
import { deleteCampaign, renameCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await deleteCampaign(campaignDeps, id);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);

export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await readBody<{ name?: unknown } | null>(req);
    if (typeof body?.name !== "string") return problem(400, "Name the campaign");
    const result = await renameCampaign(campaignDeps, id, body.name);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
