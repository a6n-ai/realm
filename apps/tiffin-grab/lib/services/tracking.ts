import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { trustedIpHeaders } from "@/lib/runtime/platform";
import { sendMetaEvent, type MetaEventInput } from "./meta-pixel/capi";
import { clientIdFromGaCookie, sendGaEvent, type GaEvent } from "./google-analytics/mp";

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
      ip: trustedIpHeaders().map((k) => h.get(k)).find(Boolean) ?? null,
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

const GA_NAMES: Record<MetaEventInput["eventName"], string> = {
  PageView: "page_view",
  Lead: "generate_lead",
  CompleteRegistration: "sign_up",
  Purchase: "purchase",
};

export function gaEventFor(input: MetaEventInput): GaEvent {
  const c = input.customData;
  return {
    name: GA_NAMES[input.eventName],
    params: {
      // GA dedupes purchases on transaction_id.
      transaction_id: input.eventName === "Purchase" ? c?.order_id : undefined,
      value: c?.value,
      currency: c?.currency,
      method: input.eventName === "CompleteRegistration" ? "email" : undefined,
    },
  };
}

/**
 * One conversion, sent to every installed tracker after the response. Pass `withRequest` only
 * when this request is the customer's own browser: a Stripe webhook or a staff verify would
 * attach the wrong IP and session.
 */
export function trackConversion(input: MetaEventInput, opts: { withRequest?: boolean; meta?: boolean } = {}): void {
  const run = async () => {
    let gaClientId: string | null = null;
    if (opts.withRequest) {
      const { sourceUrl, gaClientId: ga, ...browser } = await requestBrowser();
      gaClientId = ga;
      input = { ...input, sourceUrl: input.sourceUrl ?? sourceUrl, user: { ...browser, ...input.user } };
    }
    await Promise.all([
      opts.meta === false ? Promise.resolve() : sendMetaEvent(input),
      sendGaEvent({ clientId: gaClientId, userId: input.user.externalId, event: gaEventFor(input) }),
    ]);
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (cron, scripts): nothing to wait for, send now.
    void run();
  }
}
