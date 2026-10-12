import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { buildCampaignConfig, sendCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { signalOutbox } from "@/lib/notifications/outbox-signal";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
// Without sender/unsubscribe config the handler renders nothing, so a send must be refused up front.
const footerConfigured = () => !!buildCampaignConfig(notificationTables, process.env, { senderName: "TiffinGrab" });
const schema = z.object({ confirmedCount: z.number().int().nonnegative() });

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, "Confirm the recipient count before sending");
    const result = await sendCampaign(deps, id, parsed.data.confirmedCount, { footerConfigured: footerConfigured() });
    if ("error" in result) {
      const items = result.blocking?.length ? `: ${result.blocking.map((b) => b.message).join(" ")}` : "";
      return problem(result.status, `${result.error}${items}`);
    }
    signalOutbox();
    return json(result);
  },
);
