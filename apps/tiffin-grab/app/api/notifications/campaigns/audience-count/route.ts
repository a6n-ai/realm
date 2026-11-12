import { readBody } from "@foundry/commons/util/http";
import { handler, json } from "@foundry/routes";
import { getAudienceCount } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

/**
 * Live count for the audience builder. Calls the SAME shared audience logic
 * the send uses, so the number an admin approves is the number that gets mailed.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const audience = await readBody<Parameters<typeof getAudienceCount>[1]>(req, {});
  return json(await getAudienceCount(campaignDeps, audience));
});
