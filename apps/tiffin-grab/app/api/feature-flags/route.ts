import { createCollectionRoute } from "@foundry/routes";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, POST } = createCollectionRoute(featureFlagsService);
