// URL path kept as meal-slots for client compat; entity is dish_categories
import { createResourceRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
export const { GET, PUT, PATCH } = createResourceRoute(dishCategoriesService, { guard: () => requireAdmin() });
