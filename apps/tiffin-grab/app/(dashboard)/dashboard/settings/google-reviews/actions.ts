"use server";

import { ValidationError } from "@foundry/commons";
import {
  getGoogleReviewsConfig,
  setGoogleReviewsConfig,
  placesProvider,
} from "@foundry/google-reviews";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { integrationsConfigStore } from "@/lib/payments/integrations-config";
import { currentUserId } from "@/lib/services/session-service";
import { recordAudit } from "@/lib/identity/audit";
import { revalidatePublicSite } from "@/lib/landing/revalidate-site";

export async function saveGoogleReviewsPlaceId(placeId: string): Promise<ActionResult<{ rating: number; total: number }>> {
  return staffAction(
    { guard: "admin", revalidate: ["/dashboard/settings/google-reviews", "/dashboard/settings/integrations"] },
    async () => {
      if (!placeId) throw new ValidationError("Enter a Google Place ID");

      const summary = await placesProvider.fetchSummary(placeId);
      if (!summary) {
        throw new ValidationError("Google returned nothing for that Place ID. Check the ID and the API key.");
      }

      const current = await getGoogleReviewsConfig(integrationsConfigStore);
      await setGoogleReviewsConfig(integrationsConfigStore, { ...current, placeId });

      await recordAudit({
        entity: "integrations",
        entityPublicId: "googleReviews",
        operation: "update",
        changes: { _action: "google_reviews_place_id", placeId },
        createdBy: await currentUserId(),
      });

      revalidatePublicSite();

      return { rating: summary.rating, total: summary.total };
    },
  );
}
