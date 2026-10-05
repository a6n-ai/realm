import { notFound } from "next/navigation";
import { PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { toZonedLocal } from "@/lib/sessions/timezone";
import { discountsService } from "@/lib/services/discounts.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { DiscountsHeader } from "../../../discounts/discounts-header";
import { DiscountForm, EMPTY_DISCOUNT, type DiscountFormValues } from "../discount-form";

export default async function EditDiscountPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ discount: ["update"] });
  const { id } = await params;
  const [rows, classes, timeZone] = await Promise.all([
    discountsService.listAll(),
    studioSessionsService.listClassOptions(),
    studioSessionsService.timezone(),
  ]);
  const row = rows.find((r) => r.publicId === id);
  if (!row) notFound();
  const local = (ms: number | null) => (ms == null ? "" : toZonedLocal(new Date(ms), timeZone));
  const initial: DiscountFormValues = {
    ...EMPTY_DISCOUNT,
    name: row.name,
    scope: row.scope,
    category: row.category ?? EMPTY_DISCOUNT.category,
    sessionPublicId: row.sessionPublicId ?? "",
    valueKind: row.percentOff != null ? "percent" : "amount",
    value: String(Number(row.percentOff ?? row.amountOff ?? 0)),
    minSubtotal: row.minSubtotal == null ? "" : String(Number(row.minSubtotal)),
    startsAt: local(row.startsAt),
    endsAt: local(row.endsAt),
    stackable: row.stackable,
    active: row.active,
  };
  return (
    <PageShell>
      <DiscountsHeader />
      <SectionCard title={row.name}>
        <DiscountForm publicId={row.publicId} initial={initial} classes={classes} timeZone={timeZone} />
      </SectionCard>
    </PageShell>
  );
}
