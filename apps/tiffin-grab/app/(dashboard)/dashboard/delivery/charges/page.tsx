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
  const [baseCharge, deliveryStrategies, addressTags] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listAddressTags({ includeInactive: true, orgId }),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Delivery charges"
        subtitle="Configure base delivery fees, delivery location options, and address tag pricing rules."
      />
      <DeliveryChargesManager
        initialBaseCharge={baseCharge}
        initialDeliveryStrategies={deliveryStrategies}
        initialAddressTags={addressTags}
        actions={deliveryChargesActions}
      />
    </PageShell>
  );
}
