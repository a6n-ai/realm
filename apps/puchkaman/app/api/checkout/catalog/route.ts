import { handler, json, problem } from "@realm/routes";
import { ValidationError } from "@realm/commons";
import { ordersService } from "@/lib/services/orders.service";

/** Public catalog of products available for pickup orders. */
export const GET = handler(async (): Promise<Response> => {
  try {
    const items = await ordersService.listOrderableCatalog();
    return json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load catalog";
    return problem(500, msg);
  }
});
