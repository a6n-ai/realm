import { createResourceRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { dishesService } from "@/lib/services/dishes.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(dishesService, { guard: () => requireAdmin() });
