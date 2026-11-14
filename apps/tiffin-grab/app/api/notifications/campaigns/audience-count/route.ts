import { readBody } from "@foundry/commons/util/http";
import { getAudienceCount } from "@relay/engine";
import { adminRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

/**
 * Live count for the audience builder. Calls the SAME shared audience logic
 * the send uses, so the number an admin approves is the number that gets mailed.
 */
export const POST = adminRoute(async (req) => {
  const audience = await readBody<Parameters<typeof getAudienceCount>[1]>(req, {});
  return getAudienceCount(campaignDeps, audience);
});
