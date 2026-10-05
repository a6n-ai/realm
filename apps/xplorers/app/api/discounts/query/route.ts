import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountsService } from "@/lib/services/discounts.service";

export const { POST } = createQueryRoute(discountsService, { guard: () => requireAdmin() });
