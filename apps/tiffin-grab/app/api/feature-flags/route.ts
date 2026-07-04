import { createCollectionRoute } from "@realm/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, POST } = createCollectionRoute(featureFlagsService);
