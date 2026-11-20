import type { ReactNode } from "react";
import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ds";

export function DeliveryChargesChrome({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Delivery charges"
        subtitle="Base delivery fee, place types (tags), connected sets, and the delivery strategies customers can add, each with its own charge."
      />
      {children}
    </PageShell>
  );
}
