import { StarIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv } from "@realm/google-reviews";
import { GoogleReviewsSettingsPanel } from "@realm/google-reviews/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { saveGoogleReviewsPlaceId } from "./actions";

export default async function GoogleReviewsSettingsPage() {
  await requireAdmin();
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);

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
    </PageShell>
  );
}
