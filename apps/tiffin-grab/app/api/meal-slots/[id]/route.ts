import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
export const { GET, PUT, PATCH } = createResourceRoute(mealSlotsService, { guard: () => requireAdmin() });
