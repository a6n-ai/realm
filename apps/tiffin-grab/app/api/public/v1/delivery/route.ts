import { loadPublic } from "@/lib/public-api/load";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export const GET = async () => publicJson(await loadPublic.delivery());
