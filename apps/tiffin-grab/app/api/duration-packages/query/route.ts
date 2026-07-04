import { createQueryRoute } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(durationPackageService, { guard: () => requireAdmin() });
