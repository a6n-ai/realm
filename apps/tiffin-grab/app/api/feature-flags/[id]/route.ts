import { createResourceRoute } from "@tiffin/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(featureFlagsService);
