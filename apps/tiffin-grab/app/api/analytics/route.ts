import { gaScript } from "@foundry/google-analytics";
import { pixelScript } from "@foundry/meta-pixel";
import { googleAnalytics } from "@/lib/services/google-analytics/config";
import { getMetaPixelConfig } from "@/lib/services/meta-pixel/config";

// Tracking bootstrap served at runtime so IDs change without a rebuild: GA and Meta Pixel
// from their Settings pages (GA falls back to SSM GA_MEASUREMENT_ID until its plugin is installed).
// NEXT_PUBLIC_* would be baked in at `next build`.
export const dynamic = "force-dynamic";

export async function GET() {
  const [ga, pixel] = await Promise.all([googleAnalytics.getConfig().catch(() => null), getMetaPixelConfig().catch(() => null)]);
  const body =
    gaScript(ga ? googleAnalytics.effectiveMeasurementId(ga) : googleAnalytics.legacyMeasurementId()) + pixelScript(pixel?.installed ? pixel.pixelId : null);
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Short: a pixel ID saved in Settings should reach browsers within minutes.
      "cache-control": "public, max-age=300",
    },
  });
}
