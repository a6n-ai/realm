import { createResourceRoute } from "@tiffin/commons-next";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

// Read-only over REST. Mutations (stage changes, notes, convert) must go through
// the service / server actions so the activity timeline and guards are applied —
// the generic PATCH/DELETE would bypass that domain logic.
export const { GET } = createResourceRoute(inquiriesService, { guard: () => requireStaff() });
