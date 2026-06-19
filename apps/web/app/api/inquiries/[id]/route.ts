import { createResourceRoute } from "@tiffin/commons-next";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(inquiriesService, { guard: () => requireStaff() });
