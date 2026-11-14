import { readJson } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { createContactListFromSegment, createContactListFromSegmentSchema } from "@relay/engine";
import { adminRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const POST = adminRoute(async (req) => {
  const parsed = await readJson(req, createContactListFromSegmentSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return createContactListFromSegment(campaignDeps, parsed.data);
});
