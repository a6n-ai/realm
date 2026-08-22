import { handler, json, problem } from "@realm/routes";
import { createContactList, createContactListSchema, listContactLists } from "@realm/notifications";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  return json(await listContactLists(deps));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = createContactListSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return json(await createContactList(deps, parsed.data));
});
