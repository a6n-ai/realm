import { createQueryRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(durationPackageService, { guard: () => requireAdmin() });
