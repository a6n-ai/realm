import { createCollectionRoute } from "@realm/commons-next";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

export const { GET, POST } = createCollectionRoute(inquiriesService, { guard: () => requireStaff() });
