import { SectionCard } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getAllDeliveryTypes, getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";
import { ZoneEditor, type TypeOption, type ZoneRow } from "./zone-editor";

export default async function DeliveryZonesPage() {
  await requireAdmin();
  const [zones, types, origin] = await Promise.all([
    getZonesWithTypes(),
    getAllDeliveryTypes(),
    getStoreOrigin(),
  ]);

  // Plain JSON to the client component — no bigints, no functions.
  const zoneRows: ZoneRow[] = zones
    .sort((a, b) => a.radiusKm - b.radiusKm)
    .map((z) => ({
      publicId: z.publicId!,
      name: z.name,
      radiusKm: z.radiusKm,
      active: z.active,
      typePublicIds: z.types.map((t) => t.publicId!),
    }));
  const typeOptions: TypeOption[] = types.map((t) => ({
    publicId: t.publicId!,
    key: t.key,
    label: t.label,
    active: t.active,
  }));

  return (
    <SectionCard
      title="Coverage"
      subtitle="Rings measured out from the shop. Each ring decides which options appear at that distance."
    >
      <ZoneEditor
        mapStyleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "/api/map/style"}
        origin={origin}
        zones={zoneRows}
        types={typeOptions}
      />
    </SectionCard>
  );
}
