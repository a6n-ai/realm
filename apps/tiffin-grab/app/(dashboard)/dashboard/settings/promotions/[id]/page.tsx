import { notFound } from "next/navigation";
import { MegaphoneIcon } from "lucide-react";
import { NotFoundError } from "@foundry/commons";
import { PageHeader } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { couponsService } from "@/lib/services/coupons.service";
import { couponHeadline } from "@/lib/landing/promos";
import { promoCardHtml } from "@/lib/landing/promo-card-html";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { promotionsService, type Promotion } from "@/lib/services/promotions.service";
import { PromotionForm } from "../promotion-form";

export default async function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  let promotion: Promotion | null = null;
  if (id !== "new") {
    try {
      promotion = await promotionsService.read(id);
    } catch (e) {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }
  }
  const [{ timezone }, available] = await Promise.all([getAppSettings(), couponsService.listAvailable().catch(() => [])]);
  const coupons = available.map((c) => ({ code: c.code, name: c.name, badge: couponHeadline(c) }));
  // A linked code that has since expired is still shown so saving does not silently unlink it.
  if (promotion?.couponCode && !coupons.some((c) => c.code === promotion.couponCode)) {
    coupons.unshift({ code: promotion.couponCode, name: "no longer listed", badge: "" });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={MegaphoneIcon}
        title={promotion ? promotion.title : "New promotion"}
        subtitle="Choose where it shows, when it runs, and what it says."
      />
      <PromotionForm
        timezone={timezone}
        coupons={coupons}
        initial={promotion && {
          publicId: promotion.publicId,
          title: promotion.title,
          blurb: promotion.blurb ?? "",
          badge: promotion.badge ?? "",
          body: promotion.body ?? promotion.html ?? "",
          html: promotion.html ?? "",
          imageUrl: promotion.imageUrl ?? "",
          couponCode: promotion.couponCode ?? "",
          ctaLabel: promotion.ctaLabel,
          ctaHref: promotion.ctaHref ?? "",
          // No saved HTML: open the editor on the card as the landing page draws it today.
          starterHtml: promotion.html ? "" : promoCardHtml({
            badge: promotion.badge || coupons.find((c) => c.code === promotion.couponCode)?.badge || null,
            title: promotion.title,
            blurb: promotion.blurb,
          }),
          placements: promotion.placements,
          startsAt: promotion.startsAt,
          endsAt: promotion.endsAt,
          active: promotion.active,
          priority: promotion.priority,
        }}
      />
    </div>
  );
}
