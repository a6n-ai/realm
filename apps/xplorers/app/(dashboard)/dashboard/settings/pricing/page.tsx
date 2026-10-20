import { TagIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppClock, getDefaultPrices } from "@/lib/services/app-settings.service";
import { PricingForm } from "./pricing-form";

export default async function PricingSettingsPage() {
  await requireAdmin();
  const [prices, clock] = await Promise.all([getDefaultPrices(), getAppClock()]);
  return (
    <div className="grid gap-6">
      <PageHeader icon={TagIcon} title="Pricing" subtitle="Default per-child prices that classes inherit unless they override them." />
      <SectionCard title={`Default prices (${clock.currency})`}>
        <PricingForm initial={prices} />
      </SectionCard>
    </div>
  );
}
