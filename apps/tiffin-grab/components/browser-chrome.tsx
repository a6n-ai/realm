"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@foundry/themes";

/**
 * Keeps the phone browser's own bars on the in-app theme, not just the OS one.
 * - Chrome (Android) and Safari before 26 colour their bars from one `theme-color` meta.
 * - Safari 26 ignores that meta and samples the page instead: the root background and
 *   fixed elements touching the top/bottom edge, re-read only when such an element appears.
 *   So two hairline edge strips are re-mounted whenever the colour changes.
 * The colour is read from <body> because each area (/me, /dashboard, public) sets its own.
 */
export function BrowserChrome() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    const root = document.documentElement;
    root.style.backgroundColor = color;
    root.style.colorScheme = resolvedTheme;
    // One tag, no media query: a light/dark pair follows the OS setting and ignores the in-app choice.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
  }, [resolvedTheme, pathname]);

  // Inside <body>, so var(--background) is the same colour the body paints; the key re-mounts them.
  const key = `${resolvedTheme}:${pathname}`;
  const strip = "pointer-events-none fixed inset-x-0 z-[100] h-px bg-[var(--background)]";
  return (
    <>
      <div key={`top:${key}`} aria-hidden className={`${strip} top-0`} />
      <div key={`bottom:${key}`} aria-hidden className={`${strip} bottom-0`} />
    </>
  );
}
