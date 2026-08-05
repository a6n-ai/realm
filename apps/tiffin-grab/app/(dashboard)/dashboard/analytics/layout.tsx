import type { ReactNode } from "react";
import { BarChart3Icon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { AnalyticsTabs } from "./analytics-tabs";

export default async function AnalyticsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader icon={BarChart3Icon} title="Analytics" subtitle="Business performance across the app." />
      <AnalyticsTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
