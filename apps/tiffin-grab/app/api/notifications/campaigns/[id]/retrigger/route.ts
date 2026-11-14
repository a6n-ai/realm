import { z } from "zod";
import { problem } from "@foundry/routes";
import { retriggerCampaign } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";
const schema = z.object({ listIds: z.array(z.string()).optional() });

export const POST = adminIdRoute(async (req, id) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return problem(400, "Invalid request");
  return retriggerCampaign(campaignDeps, id, { listIds: parsed.data.listIds });
},
  { signal: () => true },
);
