import { GetTileCommand } from "@aws-sdk/client-geo-maps";
import { MAP_TILESET, bodyToResponse, geoMapsClient, mapsLog } from "@/lib/maps/geo-maps";

export const dynamic = "force-dynamic";

/** z/x/y are path segments straight from MapLibre; reject anything non-numeric
 *  before it reaches AWS so the proxy can't be used to probe other tilesets. */
const isCoord = (v: string) => /^\d{1,3}$/.test(v);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
): Promise<Response> {
  const { z, x, y } = await params;
  if (!isCoord(z) || !isCoord(x) || !isCoord(y)) {
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
