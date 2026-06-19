import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(addonService, { guard: () => requireAdmin() });
