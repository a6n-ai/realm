import { createResourceRoute } from "@tiffin/commons-next";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService } from "@/lib/services/users.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(usersService, { guard: () => requireAdmin() });
