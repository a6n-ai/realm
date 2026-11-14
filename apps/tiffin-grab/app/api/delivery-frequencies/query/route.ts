import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/catalog/catalog.service";

export const { POST } = createQueryRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
