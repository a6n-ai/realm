import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { menuSyncService } from "@/lib/sync/menu-sync.service";
import type { MenuSourceItem } from "@/lib/sync/menu-source";

type Body = {
  existingPublicId: string;
  action: "replace" | "keep" | "skip";
  incoming: MenuSourceItem;
};

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const body = (await request.json()) as Body;
  if (!body.existingPublicId || !body.action || !body.incoming) return problem(400, "Missing required fields");
  await menuSyncService.resolveDuplicate(body.existingPublicId, body.action, body.incoming);
  return json({ ok: true });
});
