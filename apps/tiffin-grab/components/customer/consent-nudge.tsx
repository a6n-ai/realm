"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { buttonClass } from "@/components/customer/kit/button-class";
import { hasConsentAnswer, saveConsent } from "@/components/consent/cookie-consent";
import { localStore } from "@foundry/ui/safe-storage";
import { SwipeBanner } from "./review-banner";

// A customer who never answered the site's cookie question is asked once while using the app, the way
// the review request asks: a top banner, swipe or X to dismiss. Dismissing is "no" for now (analytics
// stays off) and asks again after a month; either answer is final and shared across tiffingrab.ca.
const KEY = "tg-consent-nudge";
const AGAIN_MS = 30 * 24 * 60 * 60 * 1000;
// Browsing, not arriving: well after the shell and any review request have settled.
const SHOW_AFTER_MS = 15000;

export function ConsentNudge() {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (hasConsentAnswer()) return;
    if (Date.now() - Number(localStore.get(KEY) ?? 0) < AGAIN_MS) return;
    // Never on top of the review request: if that is up, this waits for another session.
    const t = setTimeout(() => { if (!hasConsentAnswer() && !document.querySelector('[aria-label="Review request"]')) setAsk(true); }, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  if (!ask) return null;

  const snooze = () => localStore.set(KEY, String(Date.now()));
  const answer = (yes: boolean, close: () => void) => { saveConsent(yes); close(); };
  return (
    <SwipeBanner
      label="Analytics question"
      icon={<BarChart3 className="size-5" strokeWidth={2} />}
      title="Help us improve the app?"
      body="Allow analytics cookies so we see which screens help. Change it anytime in Cookie settings."
      showAfterMs={0}
      onDone={snooze}
      actions={(close) => (
        <span className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => answer(false, close)} className={buttonClass({ variant: "outline", className: "!px-3" })}>No</button>
          <button type="button" onClick={() => answer(true, close)} className={buttonClass({ variant: "primary", className: "!px-3" })}>Yes</button>
        </span>
      )}
    />
  );
}
