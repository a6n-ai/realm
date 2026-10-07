/* eslint-disable react-hooks/purity */
import Link from "next/link";
import { PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission } from "@/lib/auth/guards";
import { getDiscountSettings } from "@/lib/services/app-settings.service";
import { couponsService, discountsService } from "@/lib/services/discounts.service";
import { canEditDiscounts, DiscountsHeader } from "../../discounts/discounts-header";
import { AllDiscountsTable } from "./all-discounts-table";
import { buildRows } from "./build-rows";
import { DiscountCapForm } from "./discount-cap-form";

export default async function CatalogDiscountsPage() {
  await requirePermission({ discount: ["read"] });
  const [{ maxDiscountPct }, canEdit, discountRows, couponRows] = await Promise.all([
    getDiscountSettings(),
    canEditDiscounts(),
    discountsService.listAll(),
    couponsService.listAll(),
  ]);
  const rows = buildRows({ now: Date.now(), discounts: discountRows, coupons: couponRows });
  return (
    <PageShell>
      <DiscountsHeader />
      <SectionCard title="Discount cap" subtitle="Discounts and coupons together never take more than this off a booking.">
        <DiscountCapForm value={maxDiscountPct} canEdit={canEdit} />
      </SectionCard>
      <SectionCard
        title="All discounts"
        subtitle="Automatic discounts apply by class; coupons apply when a customer types the code."
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/discounts/coupons/new">New coupon</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/catalog/discounts/new">New discount</Link>
              </Button>
            </div>
          ) : null
        }
      >
        <AllDiscountsTable rows={rows} canEdit={canEdit} />
      </SectionCard>
    </PageShell>
  );
}
