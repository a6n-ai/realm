import { readJson } from "@foundry/commons/util/http";
import { handler, json, problem } from "@foundry/routes";
import { updateCampaignAudience, updateCampaignAudienceSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = await readJson(req, updateCampaignAudienceSchema);
    if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
    const result = await updateCampaignAudience(deps, id, parsed.data.audience);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
