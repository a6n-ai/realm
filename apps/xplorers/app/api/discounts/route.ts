import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountsService } from "@/lib/services/discounts.service";

export const { GET, POST } = createCollectionRoute(discountsService, { guard: () => requireAdmin() });
