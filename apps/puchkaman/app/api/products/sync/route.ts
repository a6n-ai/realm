import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { menuSyncService } from "@/lib/sync/menu-sync.service";
import { UberEatsSnapshotSource } from "@/lib/sync/sources/uber-eats-snapshot-source";

export const POST = handler(async (): Promise<Response> => {
  await requireAdmin();
  const result = await menuSyncService.run(new UberEatsSnapshotSource());
  return json(result);
});
