import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(mealSizeService, { guard: () => requireAdmin() });
