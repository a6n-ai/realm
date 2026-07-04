import { createCollectionRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(mealSizeService, { guard: () => requireAdmin() });
