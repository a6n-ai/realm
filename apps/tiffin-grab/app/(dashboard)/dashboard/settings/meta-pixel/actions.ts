"use server";

import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { normalizePixelId, postMetaEvent, TEST_CODE_RE } from "@foundry/meta-pixel";
import { META_PIXEL_SETTINGS_HREF } from "@foundry/meta-pixel/plugin";
import { getMetaPixelConfig, metaPixel, updateMetaPixelConfig } from "@/lib/services/meta-pixel/config";
import { requestBrowser } from "@/lib/services/tracking";

const OPTS = { guard: "admin", revalidate: [META_PIXEL_SETTINGS_HREF, "/dashboard/settings/integrations"] } as const;

export async function saveMetaPixelSettings(input: {
  pixelId: string;
  /** Blank keeps the saved token. */
  accessToken: string;
  testEventCode: string;
}): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const pixelId = normalizePixelId(input.pixelId);
    const token = input.accessToken.trim();
    const testEventCode = input.testEventCode.replace(/[^A-Za-z0-9]/g, "");
    if (!pixelId) throw new ValidationError("Pixel ID is the number from Events Manager, digits only");
    if (testEventCode && !TEST_CODE_RE.test(testEventCode)) throw new ValidationError("Test event code is letters and numbers only, like TEST12345");
    if (token && (token.length < 20 || token.length > 2000 || /\s/.test(token))) {
      throw new ValidationError("That does not look like a Conversions API access token");
    }

    const sealed = token ? metaPixel.accessToken.seal(token) : undefined;
    if (sealed === null) throw new ValidationError("Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the token cannot be stored safely");

    try {
      await updateMetaPixelConfig({
        installed: true,
        pixelId,
        testEventCode: testEventCode || null,
        ...(sealed ? { accessToken: sealed } : {}),
      });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not save");
    }

    await recordAudit({
      entity: "integrations",
      entityPublicId: "metaPixel",
      operation: "update",
      // Never the token itself.
      changes: { _action: "meta_pixel_settings", pixelId, testEventCode: testEventCode || null, tokenChanged: Boolean(sealed) },
      createdBy: await currentUserId(),
    });
  });
}

export async function removeMetaPixelToken(): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    try {
      await updateMetaPixelConfig({ accessToken: null });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not remove the token");
    }
    await recordAudit({
      entity: "integrations",
      entityPublicId: "metaPixel",
      operation: "update",
      changes: { _action: "meta_pixel_token_removed" },
      createdBy: await currentUserId(),
    });
  });
}

/** Test events only: refuses without a test code so a check never lands in live data. */
export async function sendMetaPixelTestEvent(): Promise<ActionResult<{ eventsReceived?: number }>> {
  return staffAction({ guard: "admin" }, async (): Promise<{ eventsReceived?: number }> => {
    const cfg = await getMetaPixelConfig();
    if (!cfg.testEventCode) throw new ValidationError("Add the test event code from Events Manager → Test events first");
    const browser = await requestBrowser();
    const res = await postMetaEvent(await metaPixel.connection(), {
      eventName: "PageView",
      eventId: `test:${crypto.randomUUID()}`,
      userData: {
        externalId: "settings-test",
        clientIpAddress: browser.ip,
        clientUserAgent: browser.userAgent,
        fbp: browser.fbp,
        fbc: browser.fbc,
      },
    });
    if (!res.ok) throw new ValidationError(res.error);
    return { eventsReceived: res.eventsReceived };
  });
}
