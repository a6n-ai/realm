import { notFound } from "next/navigation";
import { SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { toZonedLocal } from "@/lib/sessions/timezone";
import { getAppClock } from "@/lib/services/app-settings.service";
import { couponsService } from "@/lib/services/discounts.service";
import { paymentsService } from "@/lib/services/payments.service";
import { CouponForm, type CouponFormValues } from "../coupon-form";

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ discount: ["update"] });
  const { id } = await params;
  const [row, rails, { timezone }] = await Promise.all([
    couponsService.read(id).catch(() => null),
    paymentsService.enabledRails(),
    getAppClock(),
  ]);
  if (!row) notFound();
  const local = (ms: number | null) => (ms == null ? "" : toZonedLocal(new Date(ms), timezone));
  const blank = (n: number | null) => (n == null ? "" : String(n));
  const initial: CouponFormValues = {
    code: row.code,
    name: row.name,
    valueKind: row.percentOff != null ? "percent" : "amount",
    value: String(Number(row.percentOff ?? row.amountOff ?? 0)),
    minSubtotal: row.minSubtotal == null ? "" : String(Number(row.minSubtotal)),
    maxRedemptions: blank(row.maxRedemptions),
    maxPerUser: blank(row.maxPerUser),
    allowedPaymentMethods: row.allowedPaymentMethods,
    startsAt: local(row.startsAt),
    expiresAt: local(row.expiresAt),
    stackable: row.stackable,
    active: row.active,
    redemptionCount: row.redemptionCount,
  };
  return (
    <SectionCard title={row.code}>
      <CouponForm
        publicId={row.publicId}
        initial={initial}
        methods={rails.map((m) => ({ id: m.id, label: m.label }))}
        timeZone={timezone}
      />
    </SectionCard>
  );
}
