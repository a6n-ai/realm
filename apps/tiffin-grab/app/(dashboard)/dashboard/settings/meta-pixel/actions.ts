"use server";

import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId } from "@/lib/services/session-service";
import { recordAudit } from "@/lib/identity/audit";
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
  /** Instant Forms leadgen webhook verify token. Blank keeps saved. */
  leadgenVerifyToken: string;
  /** Page access token with leads_retrieval. Blank keeps saved. */
  pageAccessToken: string;
  /** Meta App secret for webhook signatures. Blank keeps saved. */
  appSecret: string;
}): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const pixelId = normalizePixelId(input.pixelId);
    const token = input.accessToken.trim();
    const testEventCode = input.testEventCode.replace(/[^A-Za-z0-9]/g, "");
    const leadgenVerifyToken = input.leadgenVerifyToken.trim();
    const pageToken = input.pageAccessToken.trim();
    const appSecretPlain = input.appSecret.trim();
    if (!pixelId) throw new ValidationError("Pixel ID is the number from Events Manager, digits only");
    if (testEventCode && !TEST_CODE_RE.test(testEventCode)) throw new ValidationError("Test event code is letters and numbers only, like TEST12345");
    if (token && (token.length < 20 || token.length > 2000 || /\s/.test(token))) {
      throw new ValidationError("That does not look like a Conversions API access token");
    }
    if (leadgenVerifyToken && (leadgenVerifyToken.length < 8 || leadgenVerifyToken.length > 128)) {
      throw new ValidationError("Leadgen verify token should be 8–128 characters");
    }
    if (pageToken && (pageToken.length < 20 || pageToken.length > 2000 || /\s/.test(pageToken))) {
      throw new ValidationError("That does not look like a Page access token");
    }
    if (appSecretPlain && (appSecretPlain.length < 8 || appSecretPlain.length > 200 || /\s/.test(appSecretPlain))) {
      throw new ValidationError("That does not look like a Meta App secret");
    }

    const sealed = token ? metaPixel.accessToken.seal(token) : undefined;
    if (sealed === null) throw new ValidationError("Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the token cannot be stored safely");
    const sealedPage = pageToken ? metaPixel.pageAccessToken.seal(pageToken) : undefined;
    if (sealedPage === null) throw new ValidationError("Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the page token cannot be stored safely");
    const sealedAppSecret = appSecretPlain ? metaPixel.appSecret.seal(appSecretPlain) : undefined;
    if (sealedAppSecret === null) throw new ValidationError("Server is missing INTEGRATIONS_ENCRYPTION_KEY, so the app secret cannot be stored safely");

    try {
      await updateMetaPixelConfig({
        installed: true,
        pixelId,
        testEventCode: testEventCode || null,
        ...(sealed ? { accessToken: sealed } : {}),
        ...(leadgenVerifyToken ? { leadgenVerifyToken } : {}),
        ...(sealedPage ? { pageAccessToken: sealedPage } : {}),
        ...(sealedAppSecret ? { appSecret: sealedAppSecret } : {}),
      });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not save");
    }

    await recordAudit({
      entity: "integrations",
      entityPublicId: "metaPixel",
      operation: "update",
      // Never the secrets themselves.
      changes: {
        _action: "meta_pixel_settings",
        pixelId,
        testEventCode: testEventCode || null,
        tokenChanged: Boolean(sealed),
        leadgenVerifyTokenSet: Boolean(leadgenVerifyToken),
        pageTokenChanged: Boolean(sealedPage),
        appSecretChanged: Boolean(sealedAppSecret),
      },
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

export async function removeMetaLeadgenSecrets(): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    try {
      await updateMetaPixelConfig({ leadgenVerifyToken: null, pageAccessToken: null, appSecret: null });
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "Could not clear Lead Ads settings");
    }
    await recordAudit({
      entity: "integrations",
      entityPublicId: "metaPixel",
      operation: "update",
      changes: { _action: "meta_leadgen_cleared" },
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

/** CRM Qualified Leads test: system_generated Lead with a synthetic lead_id (Test events only). */
export async function sendMetaCrmTestEvent(): Promise<ActionResult<{ eventsReceived?: number }>> {
  return staffAction({ guard: "admin" }, async (): Promise<{ eventsReceived?: number }> => {
    const cfg = await getMetaPixelConfig();
    if (!cfg.testEventCode) throw new ValidationError("Add the test event code from Events Manager → Test events first");
    const res = await postMetaEvent(await metaPixel.connection(), {
      eventName: "QualifiedLead",
      eventId: `crm-test:${crypto.randomUUID()}`,
      actionSource: "system_generated",
      userData: {
        leadId: "1234567890123456",
        email: "crm-test@tiffingrab.invalid",
        phone: "+16475550100",
        country: "ca",
      },
      customData: {
        event_source: "crm",
        lead_event_source: "TiffinGrab",
      },
    });
    if (!res.ok) throw new ValidationError(res.error);
    return { eventsReceived: res.eventsReceived };
  });
}
