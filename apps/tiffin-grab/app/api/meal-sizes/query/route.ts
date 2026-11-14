import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/catalog/catalog.service";

export const { POST } = createQueryRoute(mealSizeService, { guard: () => requireAdmin() });
