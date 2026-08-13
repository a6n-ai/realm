import { countAudience } from "@realm/notifications";
import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

/**
 * Live count for the audience builder. Calls the SAME countAudience the send
 * uses, so the number an admin approves is the number that gets mailed.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const audience = await req.json().catch(() => ({}));
  const count = await countAudience(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    audience,
  );
  return json({ count });
});
