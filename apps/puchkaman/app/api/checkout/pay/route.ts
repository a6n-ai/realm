import { handler, json, problem } from "@realm/routes";
import { NotFoundError, ValidationError } from "@realm/commons";
import { ordersService, payCheckoutSchema } from "@/lib/services/orders.service";

// Same trusted header better-auth is configured to read: Caddy overwrites
// x-real-ip with the socket peer. The leftmost x-forwarded-for token is
// client-controlled (Caddy appends to it), so a buyer could hand Clover any IP
// they liked for fraud scoring.
function clientIp(request: Request): string | undefined {
  return request.headers.get("x-real-ip")?.trim() || undefined;
}

/** Pay a pending checkout with a Clover iframe card token (`source`). */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = payCheckoutSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    clientIp: clientIp(request),
  });
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    const result = await ordersService.payCheckout(parsed.data);
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    if (e instanceof NotFoundError) return problem(404, e.message);
    const msg = e instanceof Error ? e.message : "Payment failed";
    return problem(500, msg);
  }
});
