import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryService } from "@/lib/services/delivery.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { DeliveryChargesManager } from "@foundry/delivery/ui";
import { deliveryChargesActions } from "./admin-actions";

export const dynamic = "force-dynamic";

export default async function DeliveryChargesPage() {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const [baseCharge, deliveryStrategies, strategyGroups, strategyConnections] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listDeliveryStrategyGroups({ includeInactive: true, orgId }),
    deliveryService.listDeliveryStrategyConnections({ orgId }),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Delivery charges"
        subtitle="Base delivery fee, place types (tags), connected sets, and the delivery strategies customers can add, each with its own charge."
      />
      <DeliveryChargesManager
        initialBaseCharge={baseCharge}
        initialDeliveryStrategies={deliveryStrategies}
        initialStrategyGroups={strategyGroups}
        initialStrategyConnections={strategyConnections}
        actions={deliveryChargesActions}
      />
    </PageShell>
  );
}
