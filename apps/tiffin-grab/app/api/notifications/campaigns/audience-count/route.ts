import { handler, json } from "@foundry/routes";
import { getAudienceCount } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

/**
 * Live count for the audience builder. Calls the SAME shared audience logic
 * the send uses, so the number an admin approves is the number that gets mailed.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const audience = await req.json().catch(() => ({}));
  return json(await getAudienceCount(deps, audience));
});
