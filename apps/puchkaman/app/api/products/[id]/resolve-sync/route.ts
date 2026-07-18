import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { menuSyncService } from "@/lib/sync/menu-sync.service";

const VALID_ACTIONS = ["apply_name", "apply_description", "apply_price", "apply_image", "apply_all", "ignore"];

export const POST = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  if (!body.action || !VALID_ACTIONS.includes(body.action)) return problem(400, "Invalid action");
  await menuSyncService.applyPending(id, body.action as Parameters<typeof menuSyncService.applyPending>[1]);
  return json({ ok: true });
});
