import { z } from "zod";
import { createValidatedIdRoute } from "@foundry/routes";
import { addContactListMembers, manualContactSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";
const bodySchema = z.object({ contacts: z.array(manualContactSchema).min(1) });

export const POST = createValidatedIdRoute(
  bodySchema,
  (id, body) => addContactListMembers(campaignDeps, id, body.contacts),
  { guard: requireAdmin },
);
