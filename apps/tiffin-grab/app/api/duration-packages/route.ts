import { createCollectionRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/catalog/catalog.service";

export const { GET, POST } = createCollectionRoute(durationPackageService, { guard: () => requireAdmin() });
