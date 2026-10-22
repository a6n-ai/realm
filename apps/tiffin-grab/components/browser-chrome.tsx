"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@foundry/themes";

function setMeta(name: string, content: string) {
  // One tag, no media query: a light/dark pair follows the OS setting and ignores the in-app choice.
  document.querySelectorAll(`meta[name="${name}"]`).forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

/**
 * Keeps the phone browser's own bars on the in-app theme, not just the OS one.
 * - Chrome (Android) and Safari before 26 colour their bars from `theme-color`.
 * - Safari 26 ignores that and samples the page: the html/body background, the element at the
 *   very top and bottom edge, and `<meta name="color-scheme">`, which it re-reads live. Without
 *   that meta, a theme switch only reached the bars after leaving and returning to the tab.
 * The colour is read from <body> because each area (/me, /dashboard, public) sets its own.
 */
export function BrowserChrome() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    body.style.backgroundColor = "";
    const color = getComputedStyle(body).backgroundColor;
    for (const el of [document.documentElement, body]) el.style.backgroundColor = color;
    document.documentElement.style.colorScheme = resolvedTheme;
    setMeta("color-scheme", resolvedTheme);
    setMeta("theme-color", color);
  }, [resolvedTheme, pathname]);

  // The elements Safari samples at each edge: opaque, in the page colour (inside <body>, so
  // var(--background) is the body's own). Above the header and tab bar (z-40), below sheets and
  // dialogs (z-50), so an open sheet's scrim is what tints the bars. The bottom one sits mostly
  // below the edge.
  const strip = "pointer-events-none fixed inset-x-0 z-[45] bg-[var(--background)]";
  return (
    <>
      <div aria-hidden className={`${strip} top-0 h-1.5`} />
      <div aria-hidden className={`${strip} -bottom-2 h-3`} />
    </>
  );
}
