import type { NextRequest } from "next/server";
import { loadPublic } from "@/lib/public-api/load";
import { normalizePostal, POSTAL_HINT } from "@/lib/public-api/postal";
import { publicError, publicJson } from "@/lib/public-api/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const postal = normalizePostal(req.nextUrl.searchParams.get("postal"));
  if (!postal) return publicError(400, POSTAL_HINT);
  return publicJson(await loadPublic.check(postal));
}
