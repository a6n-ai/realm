import { readJson } from "@foundry/commons/util/http";
import { handler, json, problem } from "@foundry/routes";
import { createContactList, createContactListSchema, listContactLists } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  return json(await listContactLists(campaignDeps));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = await readJson(req, createContactListSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return json(await createContactList(campaignDeps, parsed.data));
});
