"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { encryptionKey, getMetaPixelConfig, sealAccessToken, updateMetaPixelConfig } from "@/lib/services/meta-pixel/config";
import { PIXEL_ID_RE, TEST_CODE_RE } from "@/lib/services/meta-pixel/pixel-id";
import { sendMetaEvent } from "@/lib/services/meta-pixel/capi";
import { requestBrowser } from "@/lib/services/tracking";
import { META_PIXEL_SETTINGS_HREF } from "@/lib/services/meta-pixel/plugin";

type Result = { error?: string };

function revalidate() {
  revalidatePath(META_PIXEL_SETTINGS_HREF);
  revalidatePath("/dashboard/settings/integrations");
}

export async function saveMetaPixelSettings(input: {
  pixelId: string;
  /** Blank keeps the saved token. */
  accessToken: string;
  testEventCode: string;
}): Promise<Result> {
  await requireAdmin();

  const pixelId = input.pixelId.trim();
  const token = input.accessToken.trim();
  const testEventCode = input.testEventCode.trim();
  if (!PIXEL_ID_RE.test(pixelId)) return { error: "Pixel ID is the number from Events Manager, digits only" };
  if (testEventCode && !TEST_CODE_RE.test(testEventCode)) return { error: "Test event code is letters and numbers only, like TEST12345" };
  if (token && !/^[A-Za-z0-9_-]{20,1000}$/.test(token)) return { error: "That does not look like a Conversions API access token" };

  let sealed: ReturnType<typeof sealAccessToken> | undefined;
  if (token) {
    const key = encryptionKey();
    if (!key) return { error: "Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the token cannot be stored safely" };
    sealed = sealAccessToken(token, key);
  }

  try {
    await updateMetaPixelConfig({
      pixelId,
      testEventCode: testEventCode || null,
      ...(sealed ? { accessToken: sealed } : {}),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save" };
  }

  await recordAudit({
    entity: "integrations",
    entityPublicId: "metaPixel",
    operation: "update",
    // Never the token itself.
    changes: { _action: "meta_pixel_settings", pixelId, testEventCode: testEventCode || null, tokenChanged: Boolean(sealed) },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}

export async function removeMetaPixelToken(): Promise<Result> {
  await requireAdmin();
  try {
    await updateMetaPixelConfig({ accessToken: null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove the token" };
  }
  await recordAudit({
    entity: "integrations",
    entityPublicId: "metaPixel",
    operation: "update",
    changes: { _action: "meta_pixel_token_removed" },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}

/** Test events only: refuses without a test code so a check never lands in live data. */
export async function sendMetaPixelTestEvent(): Promise<{ error?: string; eventsReceived?: number }> {
  await requireAdmin();
  const cfg = await getMetaPixelConfig();
  if (!cfg.testEventCode) return { error: "Add the test event code from Events Manager → Test events first" };
  const { sourceUrl: _staffPage, gaClientId: _ga, ...browser } = await requestBrowser();
  const res = await sendMetaEvent({
    eventName: "PageView",
    eventId: `test:${crypto.randomUUID()}`,
    user: { ...browser, externalId: "settings-test" },
  });
  return res.ok ? { eventsReceived: res.eventsReceived } : { error: res.error };
}
