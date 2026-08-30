import { GetGlyphsCommand } from "@aws-sdk/client-geo-maps";
import { bodyToResponse, geoMapsClient, mapsLog } from "@/lib/maps/geo-maps";

export const dynamic = "force-dynamic";

/** MapLibre requests ranges as `0-255.pbf`. Validated so the segment can't be
 *  used to reach anything else through the signed client. */
const RANGE = /^\d{1,6}-\d{1,6}\.pbf$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fontstack: string; range: string }> },
): Promise<Response> {
  const { fontstack, range } = await params;
  if (!RANGE.test(range)) return new Response("Bad glyph range", { status: 400 });

  try {
    const out = await geoMapsClient().send(
      new GetGlyphsCommand({
        // Next has already decoded the segment; AWS wants the raw stack name
        // ("Amazon Ember Regular"), which arrives percent-encoded from MapLibre.
        FontStack: decodeURIComponent(fontstack),
        FontUnicodeRange: range,
      }),
    );
    const bytes = out.Blob;
    if (!bytes) return new Response("Empty glyph range", { status: 502 });
    return bodyToResponse(bytes, out.ContentType, "application/octet-stream");
  } catch (e) {
    mapsLog.error(
      { errorName: (e as { name?: string })?.name, fontstack, range },
      "glyph request failed",
    );
    return new Response("Glyphs unavailable", { status: 502 });
  }
}
