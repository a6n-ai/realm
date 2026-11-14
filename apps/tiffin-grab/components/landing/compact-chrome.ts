"use client";

import { useEffect } from "react";

// Safari 26's bottom bar, measured on iOS: it collapses after about 32px of steady scrolling down and opens
// again only after about 62px of scrolling up, counted within one touch (separate small nudges never add up),
// so small nudges either way change nothing. It is always open at the top and the end of the page. The dock follows it through one flag on <html>; the header keeps its size.
const COLLAPSE_PX = 32;
const EXPAND_PX = 62;

/** `anchor` is where the current run of scrolling in one direction started. */
export type ChromeScroll = { last: number; anchor: number; compact: boolean };

export function chromeStep(s: ChromeScroll, y: number, atEnd: boolean): ChromeScroll {
  const turned = y !== s.last && (y > s.last) !== (s.last > s.anchor);
  const anchor = turned ? s.last : s.anchor;
  const compact = y <= 0 || atEnd ? false
    : y - anchor >= COLLAPSE_PX ? true
    : anchor - y >= EXPAND_PX ? false
    : s.compact;
  return { last: y, anchor, compact };
}

/** A new touch starts a new count, as in Safari. */
export const chromeTouch = (s: ChromeScroll, y: number): ChromeScroll => ({ ...s, last: y, anchor: y });

export const isChromeCompact = () => document.documentElement.dataset.chrome === "compact";
export const expandChrome = () => { delete document.documentElement.dataset.chrome; };

export function useCompactChrome() {
  useEffect(() => {
    const root = document.documentElement;
    let s: ChromeScroll = { last: scrollY, anchor: scrollY, compact: false };
    const onScroll = () => {
      // A tap on the small dock opens it (expandChrome) without a scroll: start from what the page shows.
      s = chromeStep({ ...s, compact: isChromeCompact() }, scrollY, scrollY + innerHeight >= root.scrollHeight - 4);
      if (s.compact) root.dataset.chrome = "compact";
      else expandChrome();
    };
    const onTouch = () => { s = chromeTouch(s, scrollY); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("touchstart", onTouch, { passive: true });
    return () => { removeEventListener("scroll", onScroll); removeEventListener("touchstart", onTouch); expandChrome(); };
  }, []);
}
