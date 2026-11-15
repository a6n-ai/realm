import type { ReactNode } from "react";
import { Building2Icon } from "lucide-react";
import { can, requirePermission } from "@/lib/auth/guards";
import { PageHeader, PageShell, RoutedTabNav } from "@/components/ds";

export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  await requirePermission({ member: ["update"] });
  const canReadRoles = await can({ ac: ["read"] });
  return (
    <PageShell>
      <PageHeader icon={Building2Icon} title="Organization" subtitle="Your brand, its franchises and the staff who run them." />
      {/* "Clients" keeps its /settings URL so existing links and bookmarks still land. */}
      <RoutedTabNav
        ariaLabel="Organization sections"
        tabs={[
          { href: "/dashboard/organization/overview", label: "Overview" },
          { href: "/dashboard/organization/access", label: "Access" },
          { href: "/dashboard/organization/members", label: "Members" },
          ...(canReadRoles ? [{ href: "/dashboard/organization/roles", label: "Roles" }] : []),
          { href: "/dashboard/organization/invites", label: "Invites" },
          { href: "/dashboard/organization/settings", label: "Clients" },
        ]}
      />
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </PageShell>
  );
}
