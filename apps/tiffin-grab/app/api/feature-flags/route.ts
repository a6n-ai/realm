import { createCollectionRoute } from "@tiffin/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, POST } = createCollectionRoute(featureFlagsService);
