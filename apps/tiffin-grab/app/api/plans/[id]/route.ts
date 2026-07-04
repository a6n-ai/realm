import { createResourceRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { planService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(planService, { guard: () => requireAdmin() });
