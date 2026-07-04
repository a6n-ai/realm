import { createResourceRoute } from "@realm/routes";
import { featureFlagsService } from "@/lib/services/feature-flags.service";

export const { GET, PUT, PATCH, DELETE } = createResourceRoute(featureFlagsService);
