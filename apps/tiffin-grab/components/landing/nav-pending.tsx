"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { leavesHost } from "@/components/cross-host-splash";

// A dynamic page takes a moment to render on the server, and until it arrives the old
// page would sit there unchanged. Mark the click at once so every area answers on press:
// a bar runs across the top (globals.css; landing.css also dims public pages) until the new pathname, or its loading.tsx skeleton, lands. Search-only
// changes (?tab=) are skipped: the pathname effect would never clear them.
export function NavPending() {
  const pathname = usePathname();

  useEffect(() => {
    delete document.documentElement.dataset.nav;
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent) => {
      // Capture phase: next/link calls preventDefault on its own clicks before a bubbling
      // listener would see them.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      // A hop to the other host is a full load: the cross-host splash covers it. Dimming here
      // too left a washed-out page with a bar under the splash, and Back restored it that way.
      if (leavesHost(a, new URL(location.href))) return;
      document.documentElement.dataset.nav = "pending";
      clearTimeout(timer);
      timer = setTimeout(() => delete document.documentElement.dataset.nav, 8000);
    };
    // Back/Forward restores the page from the bfcache exactly as it was left, mark included.
    const onShow = () => { clearTimeout(timer); delete document.documentElement.dataset.nav; };
    document.addEventListener("click", onClick, true);
    addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("click", onClick, true); removeEventListener("pageshow", onShow); clearTimeout(timer); };
  }, []);

  return null;
}
