import { createResourceRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSizeService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(mealSizeService, { guard: () => requireAdmin() });
