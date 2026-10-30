// GA bootstrap served at runtime so the measurement ID lives only in SSM
// (/tiffin-grab/prod/GA_MEASUREMENT_ID): NEXT_PUBLIC_* would be baked in at
// `next build`, where the SSM values aren't available.
export const dynamic = "force-dynamic";

export function GET() {
  const id = process.env.GA_MEASUREMENT_ID;
  // The ID is interpolated into JS, so accept only the GA4 shape.
  const body =
    id && /^G-[A-Z0-9]+$/.test(id)
      ? `(function(){var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag("js",new Date());gtag("config","${id}");})();`
      : "";
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
