import { createResourceRoute } from "@realm/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

// Single guard for GET/PUT/PATCH/DELETE (createResourceRoute is not per-method), so
// GET is held to product:["write"] rather than weakening the mutating methods to read.
export const { GET, PUT, PATCH, DELETE } = createResourceRoute(productsService, {
  guard: () => requirePermission({ product: ["write"] }),
});
