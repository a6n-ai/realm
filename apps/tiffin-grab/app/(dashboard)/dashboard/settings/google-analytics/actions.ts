"use server";

import { ValidationError } from "@foundry/commons";
import { getAppSettings } from "@/lib/settings";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId } from "@/lib/services/session-service";
import { recordAudit } from "@/lib/identity/audit";
import { GA_ID_RE, sendGaEvent } from "@foundry/google-analytics";
import { GA_SETTINGS_HREF } from "@foundry/google-analytics/plugin";
import { googleAnalytics, updateGaConfig } from "@/lib/services/google-analytics/config";
import { requestBrowser } from "@/lib/services/tracking";

const OPTS = { guard: "admin", revalidate: [GA_SETTINGS_HREF, "/dashboard/settings/integrations"] } as const;

export async function saveGaSettings(input: { measurementId: string; apiSecret: string }): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const measurementId = input.measurementId.trim().toUpperCase();
    const secret = input.apiSecret.trim();
    if (!GA_ID_RE.test(measurementId)) throw new ValidationError("Measurement ID starts with G-, like G-AB12CD34EF");
    if (secret && !/^[A-Za-z0-9_-]{10,100}$/.test(secret)) throw new ValidationError("That does not look like a Measurement Protocol API secret");

    const sealed = secret ? googleAnalytics.apiSecret.seal(secret) : undefined;
    if (sealed === null) throw new ValidationError("Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the secret cannot be stored safely");

    try {
      await updateGaConfig({ measurementId, ...(sealed ? { apiSecret: sealed } : {}) });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not save");
    }

    await recordAudit({
      entity: "integrations",
      entityPublicId: "googleAnalytics",
      operation: "update",
      changes: { _action: "google_analytics_settings", measurementId, secretChanged: Boolean(sealed) },
      createdBy: await currentUserId(),
    });
  });
}

export async function removeGaSecret(): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    try {
      await updateGaConfig({ apiSecret: null });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not remove the secret");
    }
    await recordAudit({
      entity: "integrations",
      entityPublicId: "googleAnalytics",
      operation: "update",
      changes: { _action: "google_analytics_secret_removed" },
      createdBy: await currentUserId(),
    });
  });
}

/**
 * Validates a sample purchase against Google's debug endpoint (records nothing), then sends one
 * debug_mode event so it shows in GA → Admin → DebugView without touching reports.
 */
export async function sendGaTestEvent(): Promise<ActionResult<{ problems?: string[] }>> {
  return staffAction({ guard: "admin" }, async (): Promise<{ problems?: string[] }> => {
    const { gaClientId } = await requestBrowser();
    const { currency } = await getAppSettings();
    const event = { name: "settings_test", params: { value: 1, currency } };
    const conn = await googleAnalytics.connection();
    const check = await sendGaEvent(conn, { clientId: gaClientId, event }, { validate: true });
    if (!check.ok) throw new ValidationError(check.error);
    const problems = (check.validationMessages ?? []).map((m) => m.description);
    if (problems.length) return { problems };
    const sent = await sendGaEvent(conn, { clientId: gaClientId, event }, { debug: true });
    if (!sent.ok) throw new ValidationError(sent.error);
    return {};
  });
}
