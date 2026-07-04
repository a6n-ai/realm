import { createResourceRoute } from "@realm/commons-next";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(featureFlagsService);
