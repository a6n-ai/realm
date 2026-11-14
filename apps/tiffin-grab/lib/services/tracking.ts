import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { clientIdFromGaCookie, sendGaEvent, type GaEvent } from "@foundry/google-analytics";
import type { MetaCustomData } from "@foundry/meta-pixel";
import { requestIp } from "@/lib/runtime/platform";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import { sendMetaEvent } from "@/lib/meta/capi";
import { googleAnalytics } from "@/lib/services/google-analytics/config";

export type BrowserSignals = {
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  gaClientId: string | null;
  sourceUrl: string | null;
};

/** The customer's browser signals for this request. Empty outside a request (cron, scripts). */
export async function requestBrowser(): Promise<BrowserSignals> {
  try {
    const [h, c] = await Promise.all([headers(), cookies()]);
    return {
      ip: requestIp(h),
      userAgent: h.get("user-agent"),
      fbp: c.get("_fbp")?.value ?? null,
      fbc: c.get("_fbc")?.value ?? null,
      gaClientId: clientIdFromGaCookie(c.get("_ga")?.value),
      sourceUrl: h.get("referer"),
    };
  } catch {
    return { ip: null, userAgent: null, fbp: null, fbc: null, gaClientId: null, sourceUrl: null };
  }
}

export type ConversionInput = {
  eventName: "Lead" | "CompleteRegistration" | "Purchase";
  /** Stable per real-world event: Meta drops repeats of the same name + id within 48h. */
  eventId: string;
  sourceUrl?: string | null;
  user: { email?: string | null; phone?: string | null; fullName?: string | null; externalId?: string | null };
  customData?: MetaCustomData;
  /**
   * GA4 purchase transaction_id. Prefer the payment public id so browser gtag and
   * Measurement Protocol dedupe; falls back to customData.order_id.
   */
  transactionId?: string;
  /** GA4 payment_type (stripe | etransfer | …). Not sent to Meta CAPI. */
  paymentType?: string;
};

const GA_NAMES: Record<ConversionInput["eventName"], string> = {
  Lead: "generate_lead",
  CompleteRegistration: "sign_up",
  Purchase: "purchase",
};

export function gaEventFor(input: ConversionInput): GaEvent {
  const c = input.customData;
  return {
    name: GA_NAMES[input.eventName],
    params: {
      // GA dedupes purchases on transaction_id (shared with browser gtag).
      transaction_id: input.eventName === "Purchase" ? (input.transactionId ?? c?.order_id) : undefined,
      value: c?.value,
      currency: c?.currency,
      payment_type: input.eventName === "Purchase" ? input.paymentType : undefined,
      method: input.eventName === "CompleteRegistration" ? "email" : undefined,
    },
  };
}

/**
 * One conversion, sent to every installed tracker after the response. Pass `withRequest` only
 * when this request is the customer's own browser: a Stripe webhook or a staff verify would
 * attach the wrong IP and session. `meta: false` when Meta gets the event another way
 * (Purchase goes through sendMetaPurchaseOnce with checkout attribution).
 */
export function trackConversion(input: ConversionInput, opts: { withRequest?: boolean; meta?: boolean } = {}): void {
  const run = async () => {
    let browser: Omit<BrowserSignals, "sourceUrl"> | null = null;
    let sourceUrl = input.sourceUrl ?? null;
    if (opts.withRequest) {
      if (!(await requestHasAnalyticsConsent())) return;
      const { sourceUrl: referer, ...signals } = await requestBrowser();
      browser = signals;
      sourceUrl ??= referer;
    }
    if (opts.meta !== false) {
      sendMetaEvent({
        eventName: input.eventName,
        eventId: input.eventId,
        eventSourceUrl: sourceUrl,
        userData: {
          ...input.user,
          clientIpAddress: browser?.ip,
          clientUserAgent: browser?.userAgent,
          fbp: browser?.fbp,
          fbc: browser?.fbc,
        },
        customData: input.customData,
      });
    }
    await sendGaEvent(await googleAnalytics.connection(), {
      clientId: browser?.gaClientId ?? null,
      userId: input.user.externalId,
      event: gaEventFor(input),
    });
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (cron, scripts): nothing to wait for, send now.
    void run();
  }
}
