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
  const [baseCharge, deliveryStrategies, strategyGroups] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listDeliveryStrategyGroups({ includeInactive: true, orgId }),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Delivery charges"
        subtitle="Base delivery fee, the tags customers see under their address, and the delivery strategies in each tag."
      />
      <DeliveryChargesManager
        initialBaseCharge={baseCharge}
        initialDeliveryStrategies={deliveryStrategies}
        initialStrategyGroups={strategyGroups}
        actions={deliveryChargesActions}
      />
    </PageShell>
  );
}
