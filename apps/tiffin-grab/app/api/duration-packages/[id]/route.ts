import { createResourceRoute } from "@realm/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(durationPackageService, { guard: () => requireAdmin() });
