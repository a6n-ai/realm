import { handler, json, problem } from "@foundry/routes";
import { ordersService } from "@/lib/services/orders.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

/** Public catalog of products available for pickup orders — same org scoping
 * as the /eats page (listForPublicMenu), so checkout can never offer an item
 * the menu itself hid for this franchise. */
export const GET = handler(async (): Promise<Response> => {
  try {
    const orgId = await resolveRequestOrg();
    const items = await ordersService.listOrderableCatalog(orgId);
    return json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load catalog";
    return problem(500, msg);
  }
});
