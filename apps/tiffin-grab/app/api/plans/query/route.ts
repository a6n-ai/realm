import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { planService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(planService, { guard: () => requireAdmin() });
