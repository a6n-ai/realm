import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountService } from "@/lib/catalog/catalog.service";

export const { POST } = createQueryRoute(discountService, { guard: () => requireAdmin() });
