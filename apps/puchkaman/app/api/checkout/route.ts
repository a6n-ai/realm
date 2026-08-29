import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { ValidationError } from "@realm/commons";
import {
  createCheckoutSchema,
  ordersService,
} from "@/lib/services/orders.service";

// lat/lng travel alongside the checkout body, not inside createCheckoutSchema
// (that schema is .strict() as a client-input guard) — resolved client-side
// by the AddressAutocomplete's resolve call, optional since a typed-but-
// unresolved address must still be able to check out.
const resolvedDeliverySchema = z
  .object({ lat: z.number(), lng: z.number() })
  .nullish();

/** Create pending local order + Clover atomic order; return PAKMS key for iframe. */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const resolvedDelivery = resolvedDeliverySchema.safeParse(
    (body as { resolvedDelivery?: unknown } | null)?.resolvedDelivery,
  );
  try {
    const result = await ordersService.createCheckout(
      parsed.data,
      resolvedDelivery.success ? resolvedDelivery.data : null,
    );
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return problem(500, msg);
  }
});
