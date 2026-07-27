import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono, Space_Mono } from "next/font/google";
import { ThemeProvider, THEME_STORAGE_KEY, themeInitScript } from "@realm/themes";
import "./globals.css";
import "./crm.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
// CRM admin / auth surfaces (brutalist marketing keeps Archivo via globals.css).
const geistSans = Geist({ subsets: ["latin"], variable: "--font-crm-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-crm-mono" });

export const metadata: Metadata = {
  title: "Puchkaman · Toronto's First Fusion Puchka Spot · Scarborough",
  description:
    "Puchkaman — Scarborough's fusion puchka & Indian street food spot. Pani puri, golgappa, chaat, kathi rolls, vada pav, pav bhaji. Pickup, delivery & live catering across the GTA.",
};

// Migrate legacy marketing-only key → shared @realm/themes key, then apply
// `.dark` + `data-theme` before first paint (same contract as tiffin-grab).
const THEME_BOOT = `(function(){try{var k="${THEME_STORAGE_KEY}";if(!localStorage.getItem(k)){var l=localStorage.getItem("puchkaman-theme");if(l==="light"||l==="dark")localStorage.setItem(k,l)}}catch(e){}})();${themeInitScript}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
