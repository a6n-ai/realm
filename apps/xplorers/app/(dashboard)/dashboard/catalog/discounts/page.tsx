import { PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { getDiscountSettings } from "@/lib/services/app-settings.service";
import { canEditDiscounts, DiscountsHeader } from "../../discounts/discounts-header";
import { DiscountCapForm } from "./discount-cap-form";

export default async function CatalogDiscountsPage() {
  await requirePermission({ discount: ["read"] });
  const [{ maxDiscountPct }, canEdit] = await Promise.all([getDiscountSettings(), canEditDiscounts()]);
  return (
    <PageShell>
      <DiscountsHeader />
      <SectionCard title="Discount cap" subtitle="Discounts and coupons together never take more than this off a booking.">
        <DiscountCapForm value={maxDiscountPct} canEdit={canEdit} />
      </SectionCard>
    </PageShell>
  );
}
