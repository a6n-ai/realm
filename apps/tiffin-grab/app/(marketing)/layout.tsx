import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LocationPicker } from "@/components/marketing/location-picker";
import { PublicDock } from "@/components/marketing/public-dock";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-24">{children}</main>
      <SiteFooter />
      <LocationPicker />
      <PublicDock />
    </div>
  );
}
