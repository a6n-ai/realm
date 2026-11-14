import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/catalog/catalog.service";

export const { GET, POST } = createCollectionRoute(mealSizeService, { guard: () => requireAdmin() });
