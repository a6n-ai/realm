import { createCollectionRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryZoneService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(deliveryZoneService, { guard: () => requireAdmin() });
