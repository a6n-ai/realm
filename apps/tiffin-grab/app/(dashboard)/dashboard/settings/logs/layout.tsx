import type { ReactNode } from "react";
import { ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";
import { PageHeader } from "@/components/ds";
import { can } from "@/lib/auth/guards";

export default async function SettingsLogsLayout({ children }: { children: ReactNode }) {
  const canCustomer = await can({ customer: ["read"] });
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={ScrollTextIcon}
        title="Logs"
        subtitle="Saved customer and staff activity — who changed what, and when."
      />
      <RoutedTabNav
        ariaLabel="Activity log sections"
        tabs={[
          { href: "/dashboard/settings/logs", label: "All activity" },
          ...(canCustomer ? [{ href: "/dashboard/settings/logs/customers", label: "Customer logs" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
