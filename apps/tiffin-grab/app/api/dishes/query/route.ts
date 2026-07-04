import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { dishesService } from "@/lib/services/dishes.service";

export const { POST } = createQueryRoute(dishesService, { guard: () => requireAdmin() });
