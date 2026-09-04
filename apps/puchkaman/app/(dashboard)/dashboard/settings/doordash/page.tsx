import { ExternalLinkIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { getDoorDashConfig } from "@foundry/doordash";
import { StoreLinkSettingsPanel } from "@/components/dashboard/store-link-settings-panel";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { saveDoorDashUrl } from "./actions";

export default async function DoorDashSettingsPage() {
  await requirePermission({ settings: ["read"] });
  const cfg = await getDoorDashConfig(integrationsConfigStore);

  return (
    <PageShell>
      <PageHeader
        icon={ExternalLinkIcon}
        title="DoorDash"
        subtitle="Link the public site to this client's DoorDash storefront."
      />
      <SectionCard title="Store link">
        <StoreLinkSettingsPanel label="DoorDash store URL" url={cfg.url ?? ""} onSave={saveDoorDashUrl} />
      </SectionCard>
    </PageShell>
  );
}
