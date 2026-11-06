import { bodyToResponse, errorName, mapProvider, mapsLog } from "@/lib/maps/geo-maps";

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
    // Next has already decoded the segment once; the stack name arrives
    // percent-encoded from MapLibre, and the provider wants it decoded.
    const { bytes, contentType } = await mapProvider().glyphs(decodeURIComponent(fontstack), range);
    if (!bytes.length) return new Response("Empty glyph range", { status: 502 });
    return bodyToResponse(bytes, contentType, "application/octet-stream");
  } catch (e) {
    mapsLog.error(
      { errorName: errorName(e), fontstack, range },
      "glyph request failed",
    );
    return new Response("Glyphs unavailable", { status: 502 });
  }
}
