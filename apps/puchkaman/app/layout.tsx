import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Puchkaman · Toronto's First Fusion Puchka Spot · Scarborough",
  description:
    "Puchkaman — Scarborough's fusion puchka & Indian street food spot. Pani puri, golgappa, chaat, kathi rolls, vada pav, pav bhaji. Pickup, delivery & live catering across the GTA.",
};

// Set data-theme BEFORE first paint so there's no light-mode flash (design §6.15).
const THEME_BOOT = `(function(){try{var s=localStorage.getItem('puchkaman-theme');var p=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s||(p?'dark':'light'));}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the boot script stamps data-theme on <html> before
  // React hydrates, which would otherwise trip an attribute-mismatch warning.
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${spaceMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
