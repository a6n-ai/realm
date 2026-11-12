import { handler, json, problem } from "@foundry/routes";
import { deleteContactList } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await deleteContactList(campaignDeps, id);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
