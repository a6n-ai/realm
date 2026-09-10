import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { retriggerCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const schema = z.object({ listIds: z.array(z.string()).optional() });

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return problem(400, "Invalid request");
    const result = await retriggerCampaign(deps, id, { listIds: parsed.data.listIds });
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
