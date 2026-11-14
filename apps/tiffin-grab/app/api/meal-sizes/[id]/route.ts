import { createResourceRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/catalog/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(mealSizeService, { guard: () => requireAdmin() });
