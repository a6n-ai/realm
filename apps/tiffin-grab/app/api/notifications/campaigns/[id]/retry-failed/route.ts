import { handler, json, problem } from "@foundry/routes";
import { retryFailedCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";
import { signalOutbox } from "@/lib/notifications/outbox-signal";

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const result = await retryFailedCampaign({ db, tables: notificationTables }, id);
    if ("error" in result) return problem(result.status, result.error);
    if (result.requeued > 0) signalOutbox();
    return json(result);
  },
);
