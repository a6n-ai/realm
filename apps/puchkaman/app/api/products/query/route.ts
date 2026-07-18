import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

export const { POST } = createQueryRoute(productsService, { guard: () => requireAdmin() });
