import type { ReactNode } from "react";
import { Building2Icon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, PageShell } from "@/components/ds";
import { OrgNav } from "./org-nav";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader icon={Building2Icon} title="Organization" />
      <div className="flex flex-col gap-6 sm:flex-row">
        <OrgNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageShell>
  );
}
