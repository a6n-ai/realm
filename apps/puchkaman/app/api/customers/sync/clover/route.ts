import { handler, json } from "@realm/routes";
import { requirePermission } from "@/lib/auth/guards";
import { cloverCustomersService } from "@/lib/services/clover-customers.service";

/** Pull Clover customers → local clover_customers table. */
export const POST = handler(async (): Promise<Response> => {
  await requirePermission({ clover: ["read"] });
  return json({
    direction: "pull",
    result: await cloverCustomersService.pullFromClover(),
  });
});
