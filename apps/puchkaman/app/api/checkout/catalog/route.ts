import { handler, json, problem } from "@foundry/routes";
import { ordersService } from "@/lib/services/orders.service";
import { resolveActingOrgId } from "@/lib/services/integrations.service";

/** Public catalog of products available for pickup orders — same org scoping
 * as the /eats page (listForPublicMenu), so checkout can never offer an item
 * the menu itself hid for this franchise. Resolved via resolveActingOrgId, not
 * resolveRequestOrg: proxy.ts never sets the org header on /api routes, so the
 * header read was always null here and the catalog was never scoped at all. */
export const GET = handler(async (): Promise<Response> => {
  try {
    const orgId = await resolveActingOrgId();
    const items = await ordersService.listOrderableCatalog(orgId);
    return json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load catalog";
    return problem(500, msg);
  }
});
