import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryChargesService } from "@/lib/services/delivery-charges.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { DeliveryChargesManager } from "@/components/dashboard/delivery-charges/delivery-charges-manager";

export const dynamic = "force-dynamic";

export default async function DeliveryChargesPage() {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const [baseCharge, deliveryStrategies, addressTags] = await Promise.all([
    deliveryChargesService.getBaseDeliveryCharge(orgId),
    deliveryChargesService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryChargesService.listAddressTags({ includeInactive: true, orgId }),
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
      />
    </PageShell>
  );
}
