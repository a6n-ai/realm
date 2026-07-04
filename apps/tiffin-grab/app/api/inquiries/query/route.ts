import { createQueryRoute } from "@realm/commons-next";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

export const { POST } = createQueryRoute(inquiriesService, { guard: () => requireStaff() });
