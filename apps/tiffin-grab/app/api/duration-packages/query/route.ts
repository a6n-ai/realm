import { createQueryRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/catalog/catalog.service";

export const { POST } = createQueryRoute(durationPackageService, { guard: () => requireAdmin() });
