import { handler, json, problem } from "@realm/routes";
import { ValidationError } from "@realm/commons";
import { requirePermission } from "@/lib/auth/guards";
import { pushCustomerToClover } from "@/lib/services/customers.service";

type Ctx = { params: Promise<{ id: string }> };

/** Push one app customer to Clover as a customer. */
export const POST = handler(async (_request: Request, ctx: Ctx): Promise<Response> => {
  await requirePermission({ user: ["list"] });
  const { id } = await ctx.params;
  try {
    return json(await pushCustomerToClover(id));
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return problem(500, msg);
  }
});
