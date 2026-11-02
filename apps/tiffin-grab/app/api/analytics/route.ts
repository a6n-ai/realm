import { getMetaPixelConfig } from "@/lib/services/meta-pixel/config";
import { pixelScript } from "@/lib/services/meta-pixel/script";

// Tracking bootstrap served at runtime so IDs change without a rebuild: GA from SSM
// (/tiffin-grab/prod/GA_MEASUREMENT_ID), Meta Pixel from Settings → Meta Pixel.
// NEXT_PUBLIC_* would be baked in at `next build`.
export const dynamic = "force-dynamic";

function gaScript(id: string | undefined): string {
  // Interpolated into JS, so accept only the GA4 shape.
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return "";
  return `(function(){var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag("js",new Date());gtag("config","${id}");})();`;
}

export async function GET() {
  const pixel = await getMetaPixelConfig().catch(() => null);
  const body = gaScript(process.env.GA_MEASUREMENT_ID) + pixelScript(pixel?.installed ? pixel.pixelId : null);
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Short: a pixel ID saved in Settings should reach browsers within minutes.
      "cache-control": "public, max-age=300",
    },
  });
}
