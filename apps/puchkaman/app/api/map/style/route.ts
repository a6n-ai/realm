import { GetStyleDescriptorCommand } from "@aws-sdk/client-geo-maps";
import {
  MAP_CACHE_CONTROL,
  MAP_COLOR_SCHEME,
  MAP_STYLE,
  geoMapsClient,
  mapsLog,
} from "@/lib/maps/geo-maps";

export const dynamic = "force-dynamic";

/**
 * Keyless OpenStreetMap raster — the fallback whenever Amazon Location can't be
 * reached (no AWS_REGION, missing geo-maps grant, outage). Returning this rather
 * than an error means a map always renders: the basemap silently downgrades
 * instead of the page showing an empty box.
 */
const OSM_FALLBACK = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/**
 * Amazon Location's style descriptor, with every asset URL rewritten to this
 * proxy. The upstream tile/sprite/glyph endpoints all require SigV4, so the
 * browser cannot fetch them directly — rewriting is what makes the style usable
 * without putting an AWS credential (or an Amazon Location API key) in page
 * source, which is the property Phase 1 established and this preserves.
 */
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;

  try {
    const out = await geoMapsClient().send(
      new GetStyleDescriptorCommand({ Style: MAP_STYLE, ColorScheme: MAP_COLOR_SCHEME }),
    );
    const bytes = out.Blob;
    if (!bytes) throw new Error("empty style descriptor");

    const style = JSON.parse(new TextDecoder().decode(bytes)) as {
      sources?: Record<string, { tiles?: string[] }>;
      sprite?: string;
      glyphs?: string;
    };

    for (const source of Object.values(style.sources ?? {})) {
      if (source.tiles) source.tiles = [`${origin}/api/map/tiles/{z}/{x}/{y}`];
    }
    // MapLibre appends .json/.png/@2x.png to the sprite base itself.
    style.sprite = `${origin}/api/map/sprites/sprites`;
    style.glyphs = `${origin}/api/map/glyphs/{fontstack}/{range}.pbf`;

    return Response.json(style, { headers: { "cache-control": MAP_CACHE_CONTROL } });
  } catch (e) {
    // Logged, not thrown: the fallback keeps maps working, so an unnoticed
    // permission problem would otherwise only show as a different-looking map.
    mapsLog.error(
      { errorName: (e as { name?: string })?.name, err: (e as Error)?.message },
      "style descriptor failed — serving OpenStreetMap fallback",
    );
    return Response.json(OSM_FALLBACK, { headers: { "cache-control": "public, max-age=300" } });
  }
}
