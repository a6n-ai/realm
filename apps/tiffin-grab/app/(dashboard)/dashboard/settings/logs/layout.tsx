import type { ReactNode } from "react";
import { ScrollTextIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";
import { PageHeader } from "@/components/ds";

export default function SettingsLogsLayout({ children }: { children: ReactNode }) {
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
          { href: "/dashboard/settings/logs/customers", label: "Customer logs" },
        ]}
      />
      {children}
    </div>
  );
}
