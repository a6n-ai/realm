import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/**
 * TEMPORARY — delete the whole catalogue so a Clover pull can rebuild it.
 * Remove this route, the button in products-header-actions.tsx, and
 * ProductsService.deleteAllProducts once the rebuild is done.
 *
 * Requires `{ confirm: "DELETE ALL PRODUCTS" }` in the body: this destroys
 * order line items along with the products, so an accidental POST — a retried
 * request, a curl from history — must not be enough to trigger it.
 */
export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== "DELETE ALL PRODUCTS") {
    return json({ error: "Confirmation phrase missing or incorrect" }, 400);
  }
  return json(await productsService.deleteAllProducts());
});
