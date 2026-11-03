"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { GA_ID_RE, sendGaEvent } from "@foundry/google-analytics";
import { GA_SETTINGS_HREF } from "@foundry/google-analytics/plugin";
import { googleAnalytics, updateGaConfig } from "@/lib/services/google-analytics/config";
import { requestBrowser } from "@/lib/services/tracking";

type Result = { error?: string };

function revalidate() {
  revalidatePath(GA_SETTINGS_HREF);
  revalidatePath("/dashboard/settings/integrations");
}

export async function saveGaSettings(input: { measurementId: string; apiSecret: string }): Promise<Result> {
  await requireAdmin();

  const measurementId = input.measurementId.trim().toUpperCase();
  const secret = input.apiSecret.trim();
  if (!GA_ID_RE.test(measurementId)) return { error: "Measurement ID starts with G-, like G-AB12CD34EF" };
  if (secret && !/^[A-Za-z0-9_-]{10,100}$/.test(secret)) return { error: "That does not look like a Measurement Protocol API secret" };

  const sealed = secret ? googleAnalytics.apiSecret.seal(secret) : undefined;
  if (sealed === null) return { error: "Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the secret cannot be stored safely" };

  try {
    await updateGaConfig({ measurementId, ...(sealed ? { apiSecret: sealed } : {}) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save" };
  }

  await recordAudit({
    entity: "integrations",
    entityPublicId: "googleAnalytics",
    operation: "update",
    changes: { _action: "google_analytics_settings", measurementId, secretChanged: Boolean(sealed) },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}

export async function removeGaSecret(): Promise<Result> {
  await requireAdmin();
  try {
    await updateGaConfig({ apiSecret: null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove the secret" };
  }
  await recordAudit({
    entity: "integrations",
    entityPublicId: "googleAnalytics",
    operation: "update",
    changes: { _action: "google_analytics_secret_removed" },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}

/**
 * Validates a sample purchase against Google's debug endpoint (records nothing), then sends one
 * debug_mode event so it shows in GA → Admin → DebugView without touching reports.
 */
export async function sendGaTestEvent(): Promise<{ error?: string; problems?: string[] }> {
  await requireAdmin();
  const { gaClientId } = await requestBrowser();
  const event = { name: "settings_test", params: { value: 1, currency: "CAD" } };
  const conn = await googleAnalytics.connection();
  const check = await sendGaEvent(conn, { clientId: gaClientId, event }, { validate: true });
  if (!check.ok) return { error: check.error };
  const problems = (check.validationMessages ?? []).map((m) => m.description);
  if (problems.length) return { problems };
  const sent = await sendGaEvent(conn, { clientId: gaClientId, event }, { debug: true });
  return sent.ok ? {} : { error: sent.error };
}
