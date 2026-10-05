/* eslint-disable react-hooks/purity */
import Link from "next/link";
import { SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getAppClock } from "@/lib/services/app-settings.service";
import { couponsService } from "@/lib/services/discounts.service";
import { canEditDiscounts } from "../discounts-header";
import { CouponsManager } from "./coupons-manager";

export default async function CouponsPage() {
  const [coupons, canEdit, { timezone }] = await Promise.all([couponsService.listAll(), canEditDiscounts(), getAppClock()]);
  return (
    <SectionCard
      title="Coupons"
      subtitle="Codes families type when they book."
      action={
        canEdit ? (
          <Button asChild size="sm">
            <Link href="/dashboard/discounts/coupons/new">New coupon</Link>
          </Button>
        ) : null
      }
    >
      <CouponsManager coupons={coupons} canEdit={canEdit} timeZone={timezone} now={Date.now()} />
    </SectionCard>
  );
}
