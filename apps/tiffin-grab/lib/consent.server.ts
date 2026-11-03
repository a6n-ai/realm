import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "./consent";

/** Server: did the browser making this request accept analytics and ads? False outside a request. */
export async function requestHasAnalyticsConsent(): Promise<boolean> {
  try {
    return parseConsent((await cookies()).get(CONSENT_COOKIE)?.value)?.analytics === true;
  } catch {
    return false;
  }
}
