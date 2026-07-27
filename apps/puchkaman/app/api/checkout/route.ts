import { handler, json, problem } from "@realm/routes";
import { ValidationError } from "@realm/commons";
import {
  createCheckoutSchema,
  ordersService,
} from "@/lib/services/orders.service";

/** Create pending local order + Clover atomic order; return PAKMS key for iframe. */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    const result = await ordersService.createCheckout(parsed.data);
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return problem(500, msg);
  }
});
