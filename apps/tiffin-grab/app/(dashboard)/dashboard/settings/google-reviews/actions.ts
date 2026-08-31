"use server";

import { revalidatePath } from "next/cache";
import {
  getGoogleReviewsConfig,
  setGoogleReviewsConfig,
  placesProvider,
} from "@foundry/google-reviews";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

export async function saveGoogleReviewsPlaceId(
  placeId: string,
): Promise<{ error?: string; rating?: number; total?: number }> {
  await requireAdmin();

  if (!placeId) return { error: "Enter a Google Place ID" };

  const summary = await placesProvider.fetchSummary(placeId);
  if (!summary) {
    return { error: "Google returned nothing for that Place ID. Check the ID and the API key." };
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

  revalidatePath("/dashboard/settings/google-reviews");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/", "layout");

  return { rating: summary.rating, total: summary.total };
}
