import { createQueryRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { POST } = createQueryRoute(usersService, { guard: () => requireAdmin() });
