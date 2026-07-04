import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(mealSizeService, { guard: () => requireAdmin() });
