import { createCollectionRoute } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

// One guard covers GET and POST — createCollectionRoute takes a single route-level
// guard, not per-method. product:["write"] (the POST requirement) is applied to GET
// too, which is stricter than a read needs, rather than weakening POST to ["read"].
export const { GET, POST } = createCollectionRoute(productsService, {
  guard: () => requirePermission({ product: ["write"] }),
});
