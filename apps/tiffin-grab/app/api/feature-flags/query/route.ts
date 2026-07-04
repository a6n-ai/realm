import { createQueryRoute } from "@realm/routes";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { POST } = createQueryRoute(featureFlagsService);
