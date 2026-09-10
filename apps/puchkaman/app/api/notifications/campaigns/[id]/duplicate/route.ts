import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { duplicateCampaign, type AudienceDef } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const schema = z.object({
  audience: z.object({ listIds: z.array(z.string()).optional() }).optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return problem(400, "Invalid request");
    const result = await duplicateCampaign(deps, id, {
      audience: parsed.data.audience as AudienceDef | undefined,
    });
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
