import { createResourceRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { discountService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(discountService, { guard: () => requireAdmin() });
