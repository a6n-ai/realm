import { z } from "zod";
import { createValidatedIdRoute } from "@foundry/routes";
import { addContactListMembers, manualContactSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const bodySchema = z.object({ contacts: z.array(manualContactSchema).min(1) });

export const POST = createValidatedIdRoute(
  bodySchema,
  (id, body) => addContactListMembers(deps, id, body.contacts),
  { guard: requireAdmin },
);
