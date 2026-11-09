import { readJson } from "@/lib/http/read-json";
import { handler, json, problem } from "@foundry/routes";
import { createContactListFromSegment, createContactListFromSegmentSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = await readJson(req, createContactListFromSegmentSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return json(await createContactListFromSegment(deps, parsed.data));
});
