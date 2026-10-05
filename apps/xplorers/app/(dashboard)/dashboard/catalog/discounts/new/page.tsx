import { PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { DiscountsHeader } from "../../../discounts/discounts-header";
import { DiscountForm, EMPTY_DISCOUNT } from "../discount-form";

export default async function NewDiscountPage() {
  await requirePermission({ discount: ["create"] });
  const [classes, timeZone] = await Promise.all([studioSessionsService.listClassOptions(), studioSessionsService.timezone()]);
  return (
    <PageShell>
      <DiscountsHeader />
      <SectionCard title="New discount" subtitle="Applies automatically when a family books a matching class.">
        <DiscountForm initial={EMPTY_DISCOUNT} classes={classes} timeZone={timeZone} />
      </SectionCard>
    </PageShell>
  );
}
