import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono, Space_Mono } from "next/font/google";
import { ThemeProvider, THEME_STORAGE_KEY, themeInitScript } from "@realm/themes";
import { SITE_NAME, SITE_URL, buildMetadata, localBusinessJsonLd } from "@/lib/seo";
import "./globals.css";
import "./crm.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
// CRM admin / auth surfaces (brutalist marketing keeps Archivo via globals.css).
const geistSans = Geist({ subsets: ["latin"], variable: "--font-crm-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-crm-mono" });

// Every page (including this default) provides its own fully-composed title
// via buildMetadata() rather than a title template, since template + per-page
// branded titles would double up ("... | Puchkaman · Puchkaman").
export const metadata: Metadata = {
  ...buildMetadata({
    title: `${SITE_NAME} · Toronto's First Fusion Puchka Spot · Scarborough`,
    description:
      "Puchkaman — Scarborough's fusion puchka & Indian street food spot. Pani puri, golgappa, chaat, kathi rolls, vada pav, pav bhaji. Pickup, delivery & live catering across the GTA.",
    path: "/",
  }),
  // No icons override here — app/icon.png already handles the favicon via
  // Next's file-convention route; adding a metadata icons entry too would
  // emit a duplicate <link rel="icon">.
  metadataBase: new URL(SITE_URL),
};

const businessJsonLd = localBusinessJsonLd();

// Migrate legacy marketing-only key → shared @realm/themes key, then apply
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
      className={`${archivo.variable} ${spaceMono.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {filesOrigin && <link rel="preconnect" href={filesOrigin} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
