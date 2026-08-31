import { handler, json } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";

/** Pull Clover employees → local employees table. */
export const POST = handler(async (): Promise<Response> => {
  // Same gate as inviting a user: staff provisioning, not just admin-ness.
  // `member` doesn't hold staff:invite, so this stays admin-only in practice.
  await requirePermission({ staff: ["invite"] });
  return json({
    direction: "pull",
    result: await employeesService.pullFromClover(),
  });
});
