import type { IntegrationsConfigStore } from "@foundry/commons/plugin";
import {
  DEFAULT_GOOGLE_REVIEWS_CONFIG,
  parseGoogleReviewsConfig,
  type GoogleReviewsConfig,
} from "./config";
import { GOOGLE_REVIEWS_PLUGIN_ID } from "./plugin";

export async function getGoogleReviewsConfig(
  store: IntegrationsConfigStore,
): Promise<GoogleReviewsConfig> {
  const cfg = await store.get();
  const raw = (cfg as Record<string, unknown>)[GOOGLE_REVIEWS_PLUGIN_ID];
  return raw ? parseGoogleReviewsConfig(raw) : { ...DEFAULT_GOOGLE_REVIEWS_CONFIG };
}

export async function setGoogleReviewsConfig(
  store: IntegrationsConfigStore,
  next: GoogleReviewsConfig,
): Promise<void> {
  const cfg = await store.get();
  await store.set({ ...cfg, [GOOGLE_REVIEWS_PLUGIN_ID]: parseGoogleReviewsConfig(next) });
}

export async function installGoogleReviews(store: IntegrationsConfigStore): Promise<void> {
  const current = await getGoogleReviewsConfig(store);
  await setGoogleReviewsConfig(store, { ...current, installed: true });
}

/** Keeps placeId so a reinstall does not force re-entering it. No secrets live here. */
export async function uninstallGoogleReviews(store: IntegrationsConfigStore): Promise<void> {
  const current = await getGoogleReviewsConfig(store);
  await setGoogleReviewsConfig(store, { ...current, installed: false });
}
