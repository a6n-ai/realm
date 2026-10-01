import type { ReactNode } from "react";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getAppClock } from "@/lib/services/app-settings.service";
import "@/app/marketing.css";

// Layout reads app.timezone. Docker CI has no Postgres, so prerendering any
// marketing page (/, /cancellation, …) crashes with ECONNREFUSED. Puchkaman's
// marketing layout is force-dynamic for the same reason.
export const dynamic = "force-dynamic";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-xl-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-xl-body",
});

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const { timezone } = await getAppClock();
  return (
    <TimezoneProvider tz={timezone}>
      <div className={`xl ${display.variable} ${body.variable}`}>
        <a href="#main" className="xl-skip">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
    </TimezoneProvider>
  );
}
