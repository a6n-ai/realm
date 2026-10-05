import { createResourceRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountsService } from "@/lib/services/discounts.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(discountsService, { guard: () => requireAdmin() });
