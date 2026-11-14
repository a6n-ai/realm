import { createResourceRoute } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { durationPackageService } from "@/lib/catalog/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(durationPackageService, { guard: () => requireAdmin() });
