import { createCollectionRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { GET, POST } = createCollectionRoute(usersService, { guard: () => requireAdmin() });
