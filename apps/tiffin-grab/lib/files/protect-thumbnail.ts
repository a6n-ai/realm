import { isWorkers } from "@foundry/commons/runtime/platform";
import { ValidationError } from "@foundry/commons";

type Images = {
  input(stream: ReadableStream): {
    transform(o: { blur: number }): {
      draw(overlay: unknown, o: { opacity: number; repeat: boolean }): {
        output(o: { format: "image/webp" }): Promise<{ response(): Response }>;
      };
    };
  };
};

const WATERMARK_URL = "https://assets.local/watermark/tiffingrab-watermark.png";

// Blur + tiled watermark so a thumbnail never exposes readable amounts or references.
// Off Workers (next dev, vitest) there is no IMAGES binding: bytes pass through.
// A failure on Workers throws; an unprocessed thumbnail must never be stored.
export async function protectThumbnail(
  bytes: Uint8Array,
  contentType: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!isWorkers()) return { bytes, contentType };
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as {
      IMAGES: Images & { input(stream: ReadableStream): unknown };
      ASSETS: { fetch(r: Request): Promise<Response> };
    };
    const wm = await env.ASSETS.fetch(new Request(WATERMARK_URL));
    if (!wm.ok || !wm.body) throw new Error(`watermark asset ${wm.status}`);
    const out = await env.IMAGES.input(new Response(bytes as BodyInit).body!)
      .transform({ blur: 12 })
      .draw(env.IMAGES.input(wm.body), { opacity: 0.35, repeat: true })
      .output({ format: "image/webp" });
    return { bytes: new Uint8Array(await out.response().arrayBuffer()), contentType: "image/webp" };
  } catch (e) {
    console.error("protectThumbnail failed", e);
    throw new ValidationError("Could not process the image thumbnail. Please try again.");
  }
}
