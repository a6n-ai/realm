import { readJson } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { createContactList, createContactListSchema, listContactLists } from "@relay/engine";
import { adminRoute } from "@/lib/notifications/admin-route";
import { campaignDeps } from "@/lib/notifications/deps";

export const GET = adminRoute(() => listContactLists(campaignDeps));

export const POST = adminRoute(async (req) => {
  const parsed = await readJson(req, createContactListSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return createContactList(campaignDeps, parsed.data);
});
