import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountService } from "@/lib/catalog/catalog.service";

export const { GET, POST } = createCollectionRoute(discountService, { guard: () => requireAdmin() });
