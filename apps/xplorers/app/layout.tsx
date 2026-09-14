import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider, THEME_STORAGE_KEY, themeInitScript } from "@foundry/themes";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

export const metadata: Metadata = {
  ...buildMetadata({
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description:
      "Science Explorers Club — inclusive hands-on S.T.E.A.M. classes, workshops, stage shows, family days, and birthday parties.",
    path: "/",
  }),
  metadataBase: new URL(SITE_URL),
};

const THEME_BOOT = `(function(){try{var k="${THEME_STORAGE_KEY}";if(!localStorage.getItem(k)){}}catch(e){}})();${themeInitScript}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <InlineScript html={THEME_BOOT} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
