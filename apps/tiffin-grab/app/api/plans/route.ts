import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { planService } from "@/lib/catalog/catalog.service";

export const { GET, POST } = createCollectionRoute(planService, { guard: () => requireAdmin() });
