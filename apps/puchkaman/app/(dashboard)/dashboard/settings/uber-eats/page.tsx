import { ExternalLinkIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { getUberEatsConfig } from "@foundry/uber-eats";
import { StoreLinkSettingsPanel } from "@/components/dashboard/store-link-settings-panel";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { saveUberEatsUrl } from "./actions";

export default async function UberEatsSettingsPage() {
  await requirePermission({ settings: ["read"] });
  const cfg = await getUberEatsConfig(integrationsConfigStore);

  return (
    <PageShell>
      <PageHeader
        icon={ExternalLinkIcon}
        title="Uber Eats"
        subtitle="Link the public site to this client's Uber Eats storefront."
      />
      <SectionCard title="Store link">
        <StoreLinkSettingsPanel label="Uber Eats store URL" url={cfg.url ?? ""} onSave={saveUberEatsUrl} />
      </SectionCard>
    </PageShell>
  );
}
