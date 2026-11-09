import { openApi } from "@/lib/public-api/openapi";
import { publicJson } from "@/lib/public-api/respond";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-dynamic";

export const GET = () => publicJson(openApi(publicOrigin()), { type: "application/openapi+json; charset=utf-8" });
