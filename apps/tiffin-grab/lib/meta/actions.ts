"use server";

import { getSession } from "@/lib/auth/session";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import { sendMetaEvent } from "./capi";
import { liveMetaRequestContext } from "./request-context";
import type { MetaCustomData, MetaEventName } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED: ReadonlySet<MetaEventName> = new Set([
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Contact",
  "FindLocation",
]);

export type MetaClientEventInput = {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl?: string | null;
  customData?: MetaCustomData;
  /** Raw postal for FindLocation zp hashing — never trust other user_data from the client. */
  postalCode?: string | null;
};

/** CAPI companion for Pixel events that originate in the browser. */
export async function sendMetaClientEvent(input: MetaClientEventInput): Promise<{ ok: true }> {
  if (!ALLOWED.has(input.eventName)) return { ok: true };
  if (!(await requestHasAnalyticsConsent())) return { ok: true };
  const eventId = input.eventId?.trim() ?? "";
  if (!UUID_RE.test(eventId)) return { ok: true };

  const ctx = await liveMetaRequestContext({ eventSourceUrl: input.eventSourceUrl });
  const session = await getSession();
  const user = session?.user;

  sendMetaEvent({
    eventName: input.eventName,
    eventId,
    eventSourceUrl: ctx.eventSourceUrl ?? input.eventSourceUrl,
    userData: {
      email: user?.email,
      externalId: user?.id,
      postalCode: input.postalCode,
      country: "ca",
      clientIpAddress: ctx.clientIpAddress,
      clientUserAgent: ctx.clientUserAgent,
      fbp: ctx.fbp,
      fbc: ctx.fbc,
    },
    customData: input.customData,
  });
  return { ok: true };
}
