import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { planService } from "@/lib/catalog/catalog.service";

export const { POST } = createQueryRoute(planService, { guard: () => requireAdmin() });
