import { createCollectionRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

export const { GET, POST } = createCollectionRoute(productsService, { guard: () => requireAdmin() });
