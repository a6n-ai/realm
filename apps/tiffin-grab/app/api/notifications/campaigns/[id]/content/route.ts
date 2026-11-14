import { readJson } from "@foundry/commons/util/http";
import { z } from "zod";
import { problem } from "@foundry/routes";
import { setCampaignContent, setCampaignContentSchema } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

// The shared schema only validates channel/locale as bare strings; enforce the
// app's real enums here so an invalid value 400s instead of hitting the DB's
// enum constraint.
const schema = setCampaignContentSchema.extend({
  channel: z.enum(["email", "in_app", "sms", "whatsapp"]),
  locale: z.enum(["en", "fr"]),
});

export const POST = adminIdRoute(async (req, id) => {
  const parsed = await readJson(req, schema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return setCampaignContent(campaignDeps, id, parsed.data);
});
