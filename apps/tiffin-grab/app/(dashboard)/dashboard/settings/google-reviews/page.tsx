import { StarIcon } from "lucide-react";
import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv } from "@foundry/google-reviews";
import { GoogleReviewsSettingsPanel } from "@foundry/google-reviews/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { saveGoogleReviewsPlaceId } from "./actions";

export default async function GoogleReviewsSettingsPage() {
  await requireAdmin();
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);

  return (
    <div className="grid gap-6">
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
    </div>
  );
}
