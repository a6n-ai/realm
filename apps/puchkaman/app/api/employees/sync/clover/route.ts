import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";

/** Pull Clover employees → local employees table. */
export const POST = handler(async (): Promise<Response> => {
  await requireAdmin();
  return json({
    direction: "pull",
    result: await employeesService.pullFromClover(),
  });
});
