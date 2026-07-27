import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/** GET Clover inventory items not yet linked — route → ProductsService. */
export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  const items = await productsService.listUnlinkedCloverItems();
  return json({ items });
});
