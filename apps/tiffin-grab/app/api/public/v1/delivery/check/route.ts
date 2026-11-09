import type { NextRequest } from "next/server";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { deliveryCheck, normalizePostal } from "@/lib/public-api/postal";
import { publicError, publicJson } from "@/lib/public-api/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const postal = normalizePostal(req.nextUrl.searchParams.get("postal"));
  if (!postal) return publicError(400, "postal must be a Canadian postal code or its first three characters, like M5V 2T6");
  return publicJson(deliveryCheck((await loadCatalogSnapshot()).zones, postal));
}
