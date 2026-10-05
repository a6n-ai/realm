import { SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { paymentsService } from "@/lib/services/payments.service";
import { CouponForm, EMPTY_COUPON } from "../coupon-form";

export default async function NewCouponPage() {
  await requirePermission({ discount: ["create"] });
  const [rails, { timezone }] = await Promise.all([paymentsService.enabledRails(), getAppClock()]);
  return (
    <SectionCard title="New coupon">
      <CouponForm initial={EMPTY_COUPON} methods={rails.map((m) => ({ id: m.id, label: m.label }))} timeZone={timezone} />
    </SectionCard>
  );
}
