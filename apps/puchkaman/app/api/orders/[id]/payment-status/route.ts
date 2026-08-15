import { handler, json, problem } from "@realm/routes";
import { NotFoundError, ValidationError } from "@realm/commons";
import { requirePermission } from "@/lib/auth/guards";
import { ordersService } from "@/lib/services/orders.service";

type Ctx = { params: Promise<{ id: string }> };

/** Refresh payment status from Clover and sync local payment + order (+ ledger credit). */
export const POST = handler(async (_request: Request, ctx: Ctx): Promise<Response> => {
  await requirePermission({ order: ["write"] });
  const { id } = await ctx.params;
  try {
    const result = await ordersService.checkPaymentStatus(id);
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    if (e instanceof NotFoundError) return problem(404, e.message);
    const msg = e instanceof Error ? e.message : "Status check failed";
    return problem(500, msg);
  }
});
