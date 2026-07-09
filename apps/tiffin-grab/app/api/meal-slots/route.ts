// URL path kept as meal-slots for client compat; entity is dish_categories
import { createCollectionRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
export const { GET, POST } = createCollectionRoute(dishCategoriesService, { guard: () => requireAdmin() });
