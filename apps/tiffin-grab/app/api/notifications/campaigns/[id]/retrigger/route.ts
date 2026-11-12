import {  } from "@foundry/commons/util/http";
import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { retriggerCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { signalOutbox } from "@/lib/notifications/outbox-signal";
import { campaignDeps } from "@/lib/notifications/deps";
const schema = z.object({ listIds: z.array(z.string()).optional() });

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return problem(400, "Invalid request");
    const result = await retriggerCampaign(campaignDeps, id, { listIds: parsed.data.listIds });
    if ("error" in result) return problem(result.status, result.error);
    await signalOutbox();
    return json(result);
  },
);
