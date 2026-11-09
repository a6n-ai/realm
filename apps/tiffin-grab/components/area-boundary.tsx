"use client";

import { useEffect } from "react";
import { isAppPath } from "@/lib/routing/apex";

// The public site and the signed-in app ship separate Tailwind builds (app/styles/public.css, app/styles/app.css).
// Two builds in one document fight over the same utilities (`hidden` vs `md:block`, in load order), so a link
// that crosses between them loads the page fresh instead of navigating in place.
export function AreaBoundary() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || isAppPath(to.pathname) === isAppPath(location.pathname)) return;
      e.preventDefault();
      location.assign(to.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
