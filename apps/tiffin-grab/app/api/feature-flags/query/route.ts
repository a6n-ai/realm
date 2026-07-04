import { createQueryRoute } from "@realm/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { POST } = createQueryRoute(featureFlagsService);
