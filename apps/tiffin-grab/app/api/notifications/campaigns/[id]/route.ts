import { readBody } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { deleteCampaign, renameCampaign } from "@relay/engine";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const DELETE = adminIdRoute((_req, id) => deleteCampaign(campaignDeps, id));

export const PATCH = adminIdRoute(async (req, id) => {
  const body = await readBody<{ name?: unknown } | null>(req);
  if (typeof body?.name !== "string") return problem(400, "Name the campaign");
  return renameCampaign(campaignDeps, id, body.name);
});
