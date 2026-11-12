import { readJson } from "@foundry/commons/util/http";
import { handler, json, problem } from "@foundry/routes";
import { createContactListFromSegment, createContactListFromSegmentSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = await readJson(req, createContactListFromSegmentSchema);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return json(await createContactListFromSegment(campaignDeps, parsed.data));
});
