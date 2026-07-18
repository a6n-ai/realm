import { createResourceRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(productsService, { guard: () => requireAdmin() });
