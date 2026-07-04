import { createResourceRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryZoneService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(deliveryZoneService, { guard: () => requireAdmin() });
