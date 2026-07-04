import { createQueryRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
