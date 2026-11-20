import { DeliveryChargesChrome } from "./delivery-charges-chrome";
import { requirePagePermission } from "@/lib/auth/guards";
import { deliveryService } from "@/lib/services/delivery.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { DeliveryChargesBoundary } from "./delivery-clients";

export const dynamic = "force-dynamic";

export default async function DeliveryChargesPage() {
  await requirePagePermission({ delivery: ["manage"] });
  const orgId = await resolveRequestOrg();
  const [baseCharge, deliveryStrategies, strategyGroups] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listDeliveryStrategyGroups({ includeInactive: true, orgId }),
  ]);

  return (
    <DeliveryChargesChrome>
      <DeliveryChargesBoundary
        initialBaseCharge={baseCharge}
        initialDeliveryStrategies={deliveryStrategies}
        initialStrategyGroups={strategyGroups}
      />
    </DeliveryChargesChrome>
  );
}
