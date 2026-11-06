import { bodyToResponse, errorName, mapProvider, mapsLog } from "@/lib/maps/geo-maps";
import { isValidTile } from "@/lib/maps/tile-bounds";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
): Promise<Response> {
  const { z, x, y } = await params;
  if (!isValidTile(z, x, y)) {
    return new Response("Bad tile coordinates", { status: 400 });
  }

  try {
    const { bytes, contentType } = await mapProvider().tile(z, x, y);
    if (!bytes.length) return new Response("Empty tile", { status: 502 });
    return bodyToResponse(bytes, contentType, "application/vnd.mapbox-vector-tile");
  } catch (e) {
    mapsLog.error(
      { errorName: errorName(e), z, x, y },
      "tile request failed",
    );
    return new Response("Tile unavailable", { status: 502 });
  }
}
