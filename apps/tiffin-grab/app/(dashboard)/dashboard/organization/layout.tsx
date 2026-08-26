import type { ReactNode } from "react";
import { Building2Icon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, PageShell } from "@/components/ds";
import { OrganizationTabs } from "./organization-tabs";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader icon={Building2Icon} title="Organization" />
      <OrganizationTabs />
      {children}
    </PageShell>
  );
}
