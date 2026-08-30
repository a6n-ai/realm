import { handler, json, problem } from "@realm/routes";
import { resyncContactList } from "@realm/notifications";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await resyncContactList(deps, id);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
