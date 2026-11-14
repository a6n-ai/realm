import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/catalog/catalog.service";

export const { GET, POST } = createCollectionRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
