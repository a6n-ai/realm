import type { ReactNode } from "react";
import { MailCheckIcon } from "lucide-react";
import { RoutedTabNav } from "@foundry/design-system";
import { PageHeader } from "@/components/ds";

const BASE = "/dashboard/settings/email-tracking";

export default function EmailTrackingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader icon={MailCheckIcon} title="Email tracking" subtitle="Opens, clicks and delivery records for emails." />
      <RoutedTabNav
        ariaLabel="Email tracking sections"
        tabs={[
          { href: BASE, label: "How it works" },
          { href: `${BASE}/tracked`, label: "Tracked emails" },
          { href: `${BASE}/advanced`, label: "Advanced" },
        ]}
      />
      {children}
    </div>
  );
}
