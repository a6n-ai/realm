import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell } from "@foundry/design-system";
import { OrganizationHeader, OrganizationTabs } from "./organization-tabs";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <PageShell>
      <OrganizationHeader />
      <OrganizationTabs />
      {children}
    </PageShell>
  );
}
