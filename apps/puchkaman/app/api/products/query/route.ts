import { createQueryRoute } from "@realm/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

// POST body is a filter/list query, not a mutation — read-only.
export const { POST } = createQueryRoute(productsService, {
  guard: () => requirePermission({ product: ["read"] }),
});
