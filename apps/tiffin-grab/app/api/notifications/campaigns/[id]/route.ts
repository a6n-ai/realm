import { handler, json, problem } from "@foundry/routes";
import { deleteCampaign, renameCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await deleteCampaign(deps, id);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);

export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (typeof body?.name !== "string") return problem(400, "Name the campaign");
    const result = await renameCampaign(deps, id, body.name);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
