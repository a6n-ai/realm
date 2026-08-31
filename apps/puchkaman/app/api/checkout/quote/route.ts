import { handler, json, problem } from "@foundry/routes";
import { ValidationError } from "@foundry/commons";
import { ordersService, quoteCartSchema } from "@/lib/services/orders.service";

/** Live bag pricing — server prices plus a Clover tax forecast. Creates nothing. */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = quoteCartSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    return json(await ordersService.quoteCart(parsed.data));
  } catch (e) {
    // An unavailable or unlinked product is normal here — the bag may hold something
    // that went out of stock since it was added. Surface it, don't 500.
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Failed to price cart";
    return problem(500, msg);
  }
});
