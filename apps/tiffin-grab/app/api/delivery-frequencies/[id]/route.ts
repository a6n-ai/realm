import { createResourceRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
