import type { ReactNode } from "react";
import { Caveat, Familjen_Grotesk, Figtree, Space_Mono } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { BookBar, SiteFooter } from "@/components/marketing/site-footer";
import { MarketingMotion } from "@/components/marketing/marketing-motion";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getAppClock } from "@/lib/services/app-settings.service";
import "@/app/marketing.css";

const display = Familjen_Grotesk({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-xpl-display",
});

const body = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-xpl-body",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-xpl-mono",
});

const hand = Caveat({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-xpl-hand",
});

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const { timezone } = await getAppClock();
  return (
    <TimezoneProvider tz={timezone}>
    <div className={`xpl ${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <a href="#main" className="xpl-skip">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <MarketingMotion>{children}</MarketingMotion>
      </main>
      <SiteFooter />
      <BookBar />
    </div>
    </TimezoneProvider>
  );
}
