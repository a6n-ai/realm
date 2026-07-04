import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { planService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(planService, { guard: () => requireAdmin() });
