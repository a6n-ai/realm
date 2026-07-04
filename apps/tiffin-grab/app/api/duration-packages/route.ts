import { createCollectionRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(durationPackageService, { guard: () => requireAdmin() });
