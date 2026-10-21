"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUOTE_CODES_KEY, WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY } from "@/components/wizard/selections";

export const PAID_KEY = "tg:paid";
const SEEN = "tgSeen";
const AFTER_PAID = "/me/deliveries";
// Layout effects run before paint, so a bounce hides the page without a visible frame; they warn on the server.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Called once a payment (or e-Transfer proof) is in: the wizard and checkout must not be reachable by Back.
 * The URL is left alone: rewriting it makes Next remount the page, and the remount would read the flag as a
 * fresh visit. The flag lets every stamped checkout/wizard entry (older ones, and a reload of this one)
 * bounce to the deliveries page.
 */
export function markPaid(deploymentId: string) {
  try {
    for (const k of [WIZARD_STORAGE_KEY, WIZARD_STEP_KEY, WIZARD_ORIGIN_KEY, QUOTE_CODES_KEY]) sessionStorage.removeItem(k);
    sessionStorage.setItem(PAID_KEY, JSON.stringify({ deploymentId, at: Date.now() }));
  } catch { /* storage unavailable: the cleared wizard still redirects to /subscribe */ }
}

// performance navigation timing describes the document load only, so it counts for the first mount alone.
let firstMount = true;

export const isPaid = () => {
  try { return sessionStorage.getItem(PAID_KEY) != null; } catch { return false; }
};

/**
 * Mount on checkout and the wizard pages. An entry already visited (stamped in history.state) or a
 * bfcache/popstate/back_forward arrival after paying goes to deliveries; a fresh forward visit clears the flag.
 * Returns `bouncing`: render nothing while true, so the page never shows before the redirect.
 */
export function useBounceAfterPaid() {
  const router = useRouter();
  const [bouncing, setBouncing] = useState(false);
  // The router object can change identity after markPaid rewrites the URL. Re-running this effect then
  // would take the paid flag for a fresh visit, clear it, and let checkout bounce to the wizard.
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });
  useIsoLayoutEffect(() => {
    const bounce = () => { setBouncing(true); routerRef.current.replace(AFTER_PAID); };
    const revisit = (() => {
      try {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const first = firstMount;
        firstMount = false;
        return window.history.state?.[SEEN] === true || (first && nav?.type === "back_forward");
      } catch { return false; }
    })();
    if (isPaid()) {
      if (revisit) { bounce(); return; }
      try { sessionStorage.removeItem(PAID_KEY); } catch { /* storage unavailable */ }
    }
    try { window.history.replaceState({ ...window.history.state, [SEEN]: true }, ""); } catch { /* no history API */ }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted && isPaid()) bounce(); };
    const onPop = () => { if (isPaid()) bounce(); };
    window.addEventListener("pageshow", onShow);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return bouncing;
}
