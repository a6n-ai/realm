import { StarIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { getGoogleReviewsConfig, getReviewsSummary, loadPlacesApiKeyFromEnv } from "@realm/google-reviews";
import { GoogleReviewsList, GoogleReviewsSettingsPanel } from "@realm/google-reviews/ui";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { saveGoogleReviewsPlaceId } from "./actions";

export default async function GoogleReviewsSettingsPage() {
  await requirePermission({ settings: ["read"] });
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  // Same call the public site makes, so this page shows exactly what customers
  // see — including the six-hour cache, rather than a fresher private view.
  const summary = await getReviewsSummary(integrationsConfigStore);

  return (
    <PageShell>
      <PageHeader
        icon={StarIcon}
        title="Google Reviews"
        subtitle="Show real Google ratings on the public site."
      />
      <GoogleReviewsSettingsPanel
        placeId={cfg.placeId ?? ""}
        apiKeyConfigured={Boolean(loadPlacesApiKeyFromEnv())}
        onSave={saveGoogleReviewsPlaceId}
      />
      <SectionCard title="Reviews" subtitle="What Google is returning for this listing right now.">
        <GoogleReviewsList summary={summary} />
      </SectionCard>
    </PageShell>
  );
}
