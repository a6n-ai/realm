import { GetTileCommand } from "@aws-sdk/client-geo-maps";
import { MAP_TILESET, bodyToResponse, geoMapsClient, mapsLog } from "@/lib/maps/geo-maps";
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
    const out = await geoMapsClient().send(
      new GetTileCommand({ Tileset: MAP_TILESET, Z: z, X: x, Y: y }),
    );
    const bytes = out.Blob;
    if (!bytes) return new Response("Empty tile", { status: 502 });
    return bodyToResponse(bytes, out.ContentType, "application/vnd.mapbox-vector-tile");
  } catch (e) {
    mapsLog.error(
      { errorName: (e as { name?: string })?.name, z, x, y },
      "tile request failed",
    );
    return new Response("Tile unavailable", { status: 502 });
  }
}
