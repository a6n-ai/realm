import { SectionCard } from "@foundry/design-system";
import { DeliveryChargesManager } from "@foundry/delivery/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { deliveryService } from "@/lib/delivery/zones.service";
import { resolveActingOrgId } from "@/lib/services/integrations.service";
import { deliveryChargesActions } from "../admin-actions";

export default async function DeliveryChargesPage() {
  await requireAdmin();
  const orgId = await resolveActingOrgId();
  const [baseCharge, strategies, tags] = await Promise.all([
    deliveryService.getBaseDeliveryCharge(orgId),
    deliveryService.listDeliveryStrategies({ includeInactive: true, orgId }),
    deliveryService.listAddressTags({ includeInactive: true, orgId }),
  ]);

  return (
    <SectionCard title="Charges" subtitle="Optional delivery fees. Leave empty and checkout adds nothing.">
      <DeliveryChargesManager
        initialBaseCharge={baseCharge}
        initialDeliveryStrategies={strategies}
        initialAddressTags={tags}
        actions={deliveryChargesActions}
      />
    </SectionCard>
  );
}
