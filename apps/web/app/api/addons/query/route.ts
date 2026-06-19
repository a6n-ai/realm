import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";

export const { POST } = createQueryRoute(addonService, { guard: () => requireAdmin() });
