import { apiCatalog } from "@/lib/public-api/openapi";
import { publicJson } from "@/lib/public-api/respond";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-dynamic";

export const GET = () => publicJson(apiCatalog(publicOrigin()), { type: "application/linkset+json" });
