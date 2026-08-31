import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { DeliveryTabs } from "./delivery-tabs";

/**
 * One header and one tab strip for both delivery screens, so the pages below
 * render only their own section. Matches the finance sub-tab pattern.
 */
export default function DeliverySettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Delivery"
        subtitle="What customers can choose at checkout, and how far each option reaches."
      />
      <DeliveryTabs />
      {children}
    </PageShell>
  );
}
