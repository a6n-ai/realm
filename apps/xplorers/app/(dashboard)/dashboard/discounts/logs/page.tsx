import { SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ledgerService } from "@/lib/services/ledger.service";
import { DiscountLogs } from "./discount-logs";

export default async function DiscountLogsPage() {
  await requirePermission({ discount: ["read"] });
  const [rows, { timezone }] = await Promise.all([ledgerService.listRecent(100, "discount"), getAppClock()]);
  return (
    <SectionCard title="Discount log" subtitle="Every booking that got money off, newest first.">
      <DiscountLogs rows={rows} timeZone={timezone} />
    </SectionCard>
  );
}
