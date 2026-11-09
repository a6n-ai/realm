import type { Metadata } from "next";
import "@/app/styles/public.css";
import type { ReactNode } from "react";
import { AppCurrencyProvider } from "@/components/app-currency";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PublicShell } from "@/components/landing/public-shell";
import { publicOrigin } from "@/lib/routing/apex";
import { siteOrgId } from "@/lib/tenant/site-org";

// These pages are also reachable on app.; canonical and share URLs must name the apex, or
// Google indexes the app host as the brand site.
export function generateMetadata(): Metadata {
  return { metadataBase: new URL(publicOrigin()) };
}

// Nothing renders at build time (CI has no DB); each org/path is rendered on first visit, then cached.
export function generateStaticParams() {
  return [];
}

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  await siteOrgId((await params).org);
  const { currency } = await getAppSettings();
  return <AppCurrencyProvider currency={currency}><PublicShell>{children}</PublicShell></AppCurrencyProvider>;
}
