import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { dishesService } from "@/lib/services/dishes.service";

export const { GET, POST } = createCollectionRoute(dishesService, { guard: () => requireAdmin() });
