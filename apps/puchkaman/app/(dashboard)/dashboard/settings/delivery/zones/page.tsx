import { SectionCard } from "@foundry/design-system";
import type { TypeOption, ZoneRow } from "@foundry/delivery/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { getAllDeliveryTypes, getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";
import { ZonesManager } from "./zones-manager";

export default async function DeliveryZonesPage() {
  await requireAdmin();
  const [zones, types, origin] = await Promise.all([getZonesWithTypes(), getAllDeliveryTypes(), getStoreOrigin()]);

  // Plain JSON to the client component — no bigints, no functions.
  const zoneRows: ZoneRow[] = zones.map((z) => ({
    publicId: z.publicId!,
    name: z.name,
    radiusKm: z.radiusKm,
    postalPrefixes: z.postalPrefixes,
    slotWindow: z.slotWindow,
    active: z.active,
    typePublicIds: z.types.map((t) => t.publicId!),
  }));
  const typeOptions: TypeOption[] = types.map((t) => ({ publicId: t.publicId!, key: t.key, label: t.label, active: t.active }));

  return (
    <SectionCard
      title="Coverage"
      subtitle="Postal-code zones, or rings measured out from the shop. Each zone decides which options appear there."
    >
      <ZonesManager
        mapStyleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "/api/map/style"}
        origin={origin}
        zones={zoneRows}
        types={typeOptions}
      />
    </SectionCard>
  );
}
