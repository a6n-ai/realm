import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
