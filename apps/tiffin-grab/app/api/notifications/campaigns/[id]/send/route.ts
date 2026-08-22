import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { sendCampaign } from "@realm/notifications";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const schema = z.object({ confirmedCount: z.number().int().nonnegative() });

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, "Confirm the recipient count before sending");
    return json(await sendCampaign(deps, id, parsed.data.confirmedCount));
  },
);
