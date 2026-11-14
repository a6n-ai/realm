import { createCollectionRoute } from "@foundry/routes";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";

export const { GET, POST } = createCollectionRoute(inquiriesService, { guard: () => requireStaff() });
