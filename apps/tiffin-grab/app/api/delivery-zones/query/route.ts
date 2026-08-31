import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryZoneService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(deliveryZoneService, { guard: () => requireAdmin() });
