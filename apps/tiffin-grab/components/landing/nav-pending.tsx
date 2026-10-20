"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// A dynamic page takes a moment to render on the server, and until it arrives the old
// page would sit there unchanged. Mark the click at once so the page answers on press
// (landing.css dims it and runs a bar under the header); the view transition takes
// over when the new page lands.
export function NavPending() {
  const pathname = usePathname();

  useEffect(() => {
    delete document.documentElement.dataset.nav;
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      document.documentElement.dataset.nav = "pending";
      clearTimeout(timer);
      timer = setTimeout(() => delete document.documentElement.dataset.nav, 8000);
    };
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("click", onClick); clearTimeout(timer); };
  }, []);

  return null;
}
