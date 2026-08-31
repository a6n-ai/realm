import { handler, json, problem } from "@foundry/routes";
import { createCampaign, createCampaignSchema, listCampaigns } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const schema = createCampaignSchema(["email", "in_app", "sms", "whatsapp"]);

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  return json(await listCampaigns(deps));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return json(await createCampaign(deps, parsed.data));
});
