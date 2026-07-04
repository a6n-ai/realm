import { createCollectionRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryFrequencyService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(deliveryFrequencyService, { guard: () => requireAdmin() });
