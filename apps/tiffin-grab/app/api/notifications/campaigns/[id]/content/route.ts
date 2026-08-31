import { z } from "zod";
import { handler, json, problem } from "@foundry/routes";
import { setCampaignContent, setCampaignContentSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

// The shared schema only validates channel/locale as bare strings; enforce the
// app's real enums here so an invalid value 400s instead of hitting the DB's
// enum constraint.
const schema = setCampaignContentSchema.extend({
  channel: z.enum(["email", "in_app", "sms", "whatsapp"]),
  locale: z.enum(["en", "fr"]),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
    const result = await setCampaignContent(deps, id, parsed.data);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
