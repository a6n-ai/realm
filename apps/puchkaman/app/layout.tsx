import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle } from "geist/font/pixel";
import { ThemeProvider, THEME_STORAGE_KEY, themeInitScript } from "@foundry/themes";
import { SITE_NAME, SITE_URL, buildMetadata, localBusinessJsonLd } from "@/lib/seo";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";
import "./crm.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
// CRM admin / auth surfaces (brutalist marketing keeps Archivo via globals.css).
// Self-hosted via the `geist` npm package (Vercel's own font, full glyph set +
// font-feature-settings) rather than next/font/google's Geist — exposes fixed
// --font-geist-sans / --font-geist-mono vars, referenced from crm.css.

// Every page (including this default) provides its own fully-composed title
// via buildMetadata() rather than a title template, since template + per-page
// branded titles would double up ("... | Puchkaman · Puchkaman").
export const metadata: Metadata = {
  ...buildMetadata({
    title: `${SITE_NAME} · Toronto's First Fusion Puchka Spot · Scarborough`,
    description:
      "Puchkaman — fusion puchka & Indian street food, now in two cities: Scarborough, ON and Delta, BC. Pani puri, golgappa, chaat, kathi rolls, vada pav, pav bhaji. Pickup, delivery & live catering.",
    path: "/",
  }),
  // No icons override here — app/icon.png already handles the favicon via
  // Next's file-convention route; adding a metadata icons entry too would
  // emit a duplicate <link rel="icon">.
  metadataBase: new URL(SITE_URL),
};

const businessJsonLd = localBusinessJsonLd();
// One node per storefront (see localBusinessJsonLd's doc comment) — each gets
// its own <script>, not one array in a single tag, since Google's structured
// data tooling expects one JSON-LD object (or one top-level @graph) per block.

// Migrate legacy marketing-only key → shared @foundry/themes key, then apply
// `.dark` + `data-theme` before first paint (same contract as tiffin-grab).
const THEME_BOOT = `(function(){try{var k="${THEME_STORAGE_KEY}";if(!localStorage.getItem(k)){var l=localStorage.getItem("puchkaman-theme");if(l==="light"||l==="dark")localStorage.setItem(k,l)}}catch(e){}})();${themeInitScript}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Preconnect to the image CDN when one's configured (product photos are the
  // usual LCP element on / and /eats) — falls back to same-origin /api/files
  // with nothing to preconnect to when unset.
  const filesOrigin = (() => {
    try {
      return process.env.FILES_PUBLIC_BASE_URL ? new URL(process.env.FILES_PUBLIC_BASE_URL).origin : null;
    } catch {
      return null;
    }
  })();

  // suppressHydrationWarning: the boot script stamps theme attrs on <html> before
  // React hydrates, which would otherwise trip an attribute-mismatch warning.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${spaceMono.variable} ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelCircle.variable}`}
    >
      <head>
        <InlineScript html={THEME_BOOT} />
        {filesOrigin && <link rel="preconnect" href={filesOrigin} />}
        {/* businessJsonLd is built entirely from static, developer-authored
            config (SITE_NAME, LOCATIONS, PHONE_TEL) in lib/seo.ts — no user
            input reaches this JSON.stringify, same as the single-object
            version this replaces. */}
        {businessJsonLd.map((biz) => (
          <script
            key={biz["@id"]}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(biz) }}
          />
        ))}
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
