import { z } from "zod";
import { problem } from "@foundry/routes";
import { duplicateCampaign, type AudienceDef } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";
const schema = z.object({
  name: z.string().trim().min(1).optional(),
  audience: z.object({ listIds: z.array(z.string()).optional() }).optional(),
});

export const POST = adminIdRoute(async (req, id) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return problem(400, "Invalid request");
  return duplicateCampaign(campaignDeps, id, {
    name: parsed.data.name,
    audience: parsed.data.audience as AudienceDef | undefined,
  });
});
