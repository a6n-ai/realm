import { handler, json } from "@realm/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/** GET Clover inventory items not yet linked — route → ProductsService. */
export const GET = handler(async (): Promise<Response> => {
  // Part of the Clover sync workflow (unresolved-items feed), not general catalogue
  // browsing, so it's gated on sync rather than read.
  await requirePermission({ product: ["sync"] });
  const items = await productsService.listUnlinkedCloverItems();
  return json({ items });
});
