import type { ReactNode } from "react";
import { PublicShell } from "@/components/landing/public-shell";
import { siteOrgId } from "@/lib/tenant/site-org";

// Nothing renders at build time (CI has no DB); each org/path is rendered on first visit, then cached.
export function generateStaticParams() {
  return [];
}

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  await siteOrgId((await params).org);
  return <PublicShell>{children}</PublicShell>;
}
