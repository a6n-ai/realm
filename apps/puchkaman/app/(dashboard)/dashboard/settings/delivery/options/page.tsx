import { SectionCard } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getAllDeliveryTypes } from "@/lib/delivery/zones.service";
import { TypesTable, type TypeRow } from "./types-table";

export default async function DeliveryTypesPage() {
  await requireAdmin();
  const types = await getAllDeliveryTypes();

  // Plain JSON to the client component — drop the bigint id, keep publicId as the edit key.
  const rows: TypeRow[] = types.map((t) => ({
    publicId: t.publicId!,
    key: t.key,
    label: t.label,
    description: t.description ?? null,
    requiresAddress: t.requiresAddress,
    requiresSchedule: t.requiresSchedule,
    minSubtotal: t.minSubtotal,
    discountPct: t.discountPct,
    sortOrder: t.sortOrder,
    active: t.active,
  }));

  return (
    <SectionCard
      title="Options"
      subtitle="What a customer can pick at checkout, and the rules each option carries."
    >
      <TypesTable types={rows} />
    </SectionCard>
  );
}
