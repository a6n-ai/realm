import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { menuSyncService } from "@/lib/sync/menu-sync.service";
import { UberEatsSnapshotSource } from "@/lib/sync/sources/uber-eats-snapshot-source";

export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    redownloadImages?: unknown;
    optimizeImages?: unknown;
  };
  const result = await menuSyncService.run(new UberEatsSnapshotSource(), {
    redownloadImages: !!body.redownloadImages,
    // Default on: absent flag (older client) keeps the optimizing behavior.
    optimizeImages: body.optimizeImages === undefined ? true : !!body.optimizeImages,
  });
  return json(result);
});
