import { SettingsIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getMinOrderValue } from "@/lib/services/integrations.service";
import { MinOrderForm } from "./min-order-form";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const minOrderValue = await getMinOrderValue();

  return (
    <PageShell>
      <PageHeader icon={SettingsIcon} title="General" subtitle="Storewide ordering rules." />
      <div className="grid gap-6">
        <MinOrderForm current={minOrderValue} />
      </div>
    </PageShell>
  );
}
