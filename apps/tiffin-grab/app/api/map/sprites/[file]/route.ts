import { bodyToResponse, errorName, mapProvider, mapsLog } from "@/lib/maps/geo-maps";

export const dynamic = "force-dynamic";

/** MapLibre appends .json / .png / @2x.png to the sprite base — nothing else is
 *  a legitimate request, so the allowlist doubles as input validation. */
const ALLOWED = new Set(["sprites.json", "sprites.png", "sprites@2x.json", "sprites@2x.png"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  if (!ALLOWED.has(file)) return new Response("Unknown sprite", { status: 404 });

  try {
    const { bytes } = await mapProvider().sprite(file);
    if (!bytes.length) return new Response("Empty sprite", { status: 502 });
    // Derive the type from the filename rather than trusting upstream: AWS
    // returns binary/octet-stream even for sprites.json, and MapLibre needs
    // that served as JSON to parse the sprite index.
    return bodyToResponse(
      bytes,
      file.endsWith(".json") ? "application/json" : "image/png",
      "application/octet-stream",
    );
  } catch (e) {
    mapsLog.error({ errorName: errorName(e), file }, "sprite request failed");
    return new Response("Sprite unavailable", { status: 502 });
  }
}
