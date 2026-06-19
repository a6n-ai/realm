import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { addonService } from "@/lib/services/catalog.service";

export const { GET, POST } = createCollectionRoute(addonService, { guard: () => requireAdmin() });
