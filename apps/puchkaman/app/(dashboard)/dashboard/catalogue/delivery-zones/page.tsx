import { MapPinnedIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getDeliveryTypes, getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";
import { ZoneEditor, type TypeOption, type ZoneRow } from "./zone-editor";

export const dynamic = "force-dynamic";

export default async function DeliveryZonesPage() {
  await requireAdmin();
  const [zones, types, origin] = await Promise.all([
    getZonesWithTypes(),
    getDeliveryTypes(),
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
    <PageShell>
      <PageHeader
        icon={MapPinnedIcon}
        title="Delivery zones"
        subtitle="Concentric delivery rings measured from the shop, and which delivery types each offers."
      />
      <SectionCard title="Zones">
        <ZoneEditor
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? null}
          origin={origin}
          zones={zoneRows}
          types={typeOptions}
        />
      </SectionCard>
    </PageShell>
  );
}
