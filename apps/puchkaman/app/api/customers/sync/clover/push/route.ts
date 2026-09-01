import { handler, json, problem } from "@foundry/routes";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { pushAllCustomersToClover } from "@/lib/services/customers.service";

/** Push every unsynced app customer → Clover as a customer. */
export const POST = handler(async (): Promise<Response> => {
  await requirePermission({ user: ["list"] });
  try {
    return json({ direction: "push", result: await pushAllCustomersToClover() });
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return problem(500, msg);
  }
});
